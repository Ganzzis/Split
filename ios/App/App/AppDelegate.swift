import UIKit
import SwiftUI
import WebKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

// Kept in the app target; no external server or broad filesystem permission.
import UniformTypeIdentifiers

@objc(SplitDocumentsPlugin)
public class SplitDocumentsPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "SplitDocumentsPlugin"
    public let jsName = "SplitDocuments"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "importJSON", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exportJSON", returnType: CAPPluginReturnPromise)
    ]
    private var pending: CAPPluginCall?
    private var exportURL: URL?
    private let limit = 10 * 1024 * 1024

    private func present(_ picker: UIDocumentPickerViewController, call: CAPPluginCall) {
        guard pending == nil, let controller = bridge?.viewController, controller.presentedViewController == nil else {
            call.reject("Document picker is already open or unavailable"); return
        }
        pending = call; picker.delegate = self
        controller.present(picker, animated: !UIAccessibility.isReduceMotionEnabled)
    }
    @objc func importJSON(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.present(UIDocumentPickerViewController(forOpeningContentTypes: [.json, .plainText], asCopy: true), call: call)
        }
    }
    @objc func exportJSON(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pending == nil else { call.reject("Document picker already open"); return }
            guard let raw = call.getString("raw"), let data = raw.data(using: .utf8), data.count <= self.limit else { call.reject("Invalid JSON size"); return }
            let requested = call.getString("name") ?? "split-history.json"
            let name = requested.range(of: "^[A-Za-z0-9_-]+\\.json$", options: .regularExpression) != nil ? requested : "split-history.json"
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let url = directory.appendingPathComponent(name)
                try data.write(to: url, options: .atomic)
                self.exportURL = url
                self.present(UIDocumentPickerViewController(forExporting: [url], asCopy: true), call: call)
                if self.pending == nil { self.cleanup() }
            } catch { self.cleanup(); call.reject("Unable to prepare JSON") }
        }
    }
    private func cleanup() {
        if let url = exportURL { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        exportURL = nil
    }
    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pending?.resolve(["cancelled": true]); pending = nil; cleanup()
    }
    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pending else { return }
        defer { pending = nil; cleanup() }
        if exportURL != nil { call.resolve(["saved": true]); return }
        guard let url = urls.first else { call.reject("No document"); return }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? limit + 1
            guard size <= limit else { call.reject("File exceeds 10 MB"); return }
            let data = try Data(contentsOf: url)
            guard data.count <= limit, let raw = String(data: data, encoding: .utf8) else { call.reject("Invalid UTF-8 JSON"); return }
            call.resolve(["raw": raw])
        } catch { call.reject("Unable to read JSON") }
    }
}

class SplitViewController: CAPBridgeViewController {
    let chromeModel = SplitChromeModel()
    var floatingHost: UIHostingController<SplitFloatingTabs>?
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SplitDocumentsPlugin())
        bridge?.registerPluginInstance(SplitChromePlugin())
        #if DEBUG
        // XCTest-only fixture on an isolated Simulator container. Never runs in normal launches.
        if ProcessInfo.processInfo.arguments.contains("--split-ui-tests"),
           let fixture = ProcessInfo.processInfo.environment["SPLIT_UI_TEST_FIXTURE"],
           let encoded = try? JSONSerialization.data(withJSONObject: [fixture]),
           let literal = String(data: encoded, encoding: .utf8) {
            let theme = ProcessInfo.processInfo.environment["SPLIT_UI_TEST_THEME"] == "dark" ? "dark" : "light"
            let source = "localStorage.setItem('split-history-v4', " + literal + "[0]); localStorage.setItem('split-theme', '" + theme + "');"
            webView?.configuration.userContentController.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        #endif
    }
}
