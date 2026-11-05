import UIKit
import SwiftUI
import Capacitor

extension UIColor {
    static var splitAccent: UIColor { UIColor { traits in
        traits.userInterfaceStyle == .dark ? UIColor(red: 0.79, green: 0.70, blue: 0.98, alpha: 1) : UIColor(red: 0.48, green: 0.31, blue: 0.77, alpha: 1)
    } }
}
extension Color { static var splitAccent: Color { Color(uiColor: .splitAccent) } }

final class SplitChromeModel: ObservableObject {
    @Published var section = "history"
    @Published var hasCurrent = false
    var action: ((String, String?) -> Void)?
}

struct SplitTabPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.scaleEffect(configuration.isPressed && !reduceMotion ? 0.96 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.14), value: configuration.isPressed)
    }
}

struct SplitFloatingTabs: View {
    @ObservedObject var model: SplitChromeModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Namespace private var selection
    private let tabs = [("history", "История", "clock.arrow.circlepath"), ("calculation", "Расчёт", "person.2"), ("results", "Итоги", "chart.bar.xaxis")]
    private var buttons: some View {
        HStack(spacing: 4) {
            ForEach(tabs, id: \.0) { tab in
                Button {
                    model.action?("navigate", tab.0)
                } label: {
                    VStack(spacing: 5) {
                        Image(systemName: tab.2).font(.system(size: 21, weight: .medium))
                        Text(tab.1).font(.caption2.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity).frame(minHeight: 55)
                    .foregroundStyle(model.section == tab.0 ? Color.splitAccent : Color.primary.opacity(0.7))
                    .background {
                        if model.section == tab.0 {
                            Capsule().fill(Color.splitAccent.opacity(0.14)).matchedGeometryEffect(id: "active", in: selection)
                        }
                    }
                    .contentShape(Capsule())
                }
                .buttonStyle(SplitTabPressStyle())
                .disabled(tab.0 != "history" && !model.hasCurrent)
                .opacity(tab.0 != "history" && !model.hasCurrent ? 0.4 : 1)
                .accessibilityLabel(tab.1)
                .accessibilityAddTraits(model.section == tab.0 ? .isSelected : [])
                .accessibilityIdentifier("native-tab-" + tab.0)
            }
        }
        .padding(6)
        .animation(reduceMotion ? nil : .spring(response: 0.36, dampingFraction: 0.82), value: model.section)
    }
    var body: some View {
        Group {
            if reduceTransparency {
                buttons.background(Color(uiColor: .secondarySystemBackground), in: Capsule())
            } else if #available(iOS 26.0, *) {
                buttons.glassEffect(.regular.interactive(), in: .capsule)
            } else {
                buttons.background(.ultraThinMaterial, in: Capsule())
                    .overlay(Capsule().strokeBorder(Color.white.opacity(0.22), lineWidth: 0.5))
            }
        }
        .shadow(color: .black.opacity(reduceTransparency ? 0 : 0.1), radius: 15, y: 6)
    }
}

struct SplitIntentSheet: View {
    let title: String
    let message: String
    let editing: Bool
    let destructive: Bool
    let confirm: String
    let completion: (Bool, String) -> Void
    @State var value: String
    @FocusState private var focused: Bool
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Image(systemName: editing ? "pencil.line" : destructive ? "trash" : "checkmark.shield")
                        .font(.system(size: 30, weight: .medium)).foregroundStyle(destructive ? Color.red : Color.splitAccent)
                        .padding(18).background(Color.splitAccent.opacity(0.08), in: RoundedRectangle(cornerRadius: 22))
                    Text(title).font(.title2.bold()).accessibilityAddTraits(.isHeader)
                    if !message.isEmpty { Text(message).font(.body).foregroundStyle(.secondary) }
                    if editing {
                        TextField("Название расчёта", text: $value).textFieldStyle(.roundedBorder)
                            .font(.title3).focused($focused).submitLabel(.done)
                            .onChange(of: value) { next in if next.count > 120 { value = String(next.prefix(120)) } }
                            .onSubmit { if !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { completion(true, value) } }
                    }
                }.padding(24).frame(maxWidth: .infinity, alignment: .leading)
            }
            .safeAreaInset(edge: .bottom) {
                Button(role: destructive ? .destructive : nil) { completion(true, value) } label: {
                    Text(confirm).font(.headline).frame(maxWidth: .infinity).padding(.vertical, 12)
                }.buttonStyle(.borderedProminent).tint(destructive ? .red : .splitAccent)
                    .disabled(editing && value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .padding(24).background(.regularMaterial)
            }
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Отмена") { completion(false, value) } } }
            .onAppear { if editing { focused = true } }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

@objc(SplitChromePlugin)
public class SplitChromePlugin: CAPPlugin, CAPBridgedPlugin, UIAdaptivePresentationControllerDelegate {
    public let identifier = "SplitChromePlugin"
    public let jsName = "SplitChrome"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "setState", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "presentSheet", returnType: CAPPluginReturnPromise)]
    private var sheetCall: CAPPluginCall?
    private var sheet: UIViewController?
    func action(_ action: String, view: String? = nil) {
        notifyListeners("action", data: ["action": action, "view": view ?? ""])
    }
    @objc func setState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController as? SplitViewController else { call.reject("Native chrome unavailable"); return }
            vc.updateChrome(plugin: self, section: call.getString("view") ?? "history", title: call.getString("title") ?? "Расчёт", hasCurrent: call.getBool("hasCurrent") ?? false, dark: call.getBool("dark") ?? false, modal: call.getBool("modal") ?? false, scrolled: call.getBool("scrolled") ?? false)
            call.resolve()
        }
    }
    @objc func presentSheet(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.sheetCall == nil, let vc = self.bridge?.viewController, vc.presentedViewController == nil else { call.reject("Sheet already presented"); return }
            self.sheetCall = call
            let content = SplitIntentSheet(title: call.getString("title") ?? "Split", message: call.getString("message") ?? "", editing: call.getBool("editing") ?? false, destructive: call.getBool("destructive") ?? false, confirm: call.getString("confirm") ?? "Подтвердить", completion: { [weak self] confirmed, value in self?.finishSheet(confirmed, value: value) }, value: call.getString("value") ?? "")
            let host = UIHostingController(rootView: content)
            host.overrideUserInterfaceStyle = vc.overrideUserInterfaceStyle
            self.sheet = host
            vc.present(host, animated: !UIAccessibility.isReduceMotionEnabled)
            host.presentationController?.delegate = self
        }
    }
    private func finishSheet(_ confirmed: Bool, value: String) {
        guard let call = sheetCall else { return }
        sheetCall = nil
        sheet?.dismiss(animated: !UIAccessibility.isReduceMotionEnabled) { call.resolve(["confirmed": confirmed, "value": value]) }
        sheet = nil
    }
    public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        sheetCall?.resolve(["confirmed": false, "value": ""]); sheetCall = nil; sheet = nil
    }
}

extension SplitViewController {
    func updateChrome(plugin: SplitChromePlugin, section: String, title: String, hasCurrent: Bool, dark: Bool, modal: Bool, scrolled: Bool) {
        chromeModel.section = section; chromeModel.hasCurrent = hasCurrent
        chromeModel.action = { [weak plugin] action, view in plugin?.action(action, view: view) }
        overrideUserInterfaceStyle = dark ? .dark : .light
        navigationController?.overrideUserInterfaceStyle = overrideUserInterfaceStyle
        floatingHost?.overrideUserInterfaceStyle = overrideUserInterfaceStyle
        navigationController?.setNavigationBarHidden(false, animated: false)
        if floatingHost == nil, let owner = navigationController {
            let parent = owner.view!
            edgesForExtendedLayout = []
            let host = UIHostingController(rootView: SplitFloatingTabs(model: chromeModel))
            owner.addChild(host); parent.addSubview(host.view); host.didMove(toParent: owner)
            host.view.backgroundColor = .clear; host.view.translatesAutoresizingMaskIntoConstraints = false
            let preferredWidth = host.view.widthAnchor.constraint(equalTo: parent.widthAnchor, constant: -32)
            preferredWidth.priority = .defaultHigh
            NSLayoutConstraint.activate([
                host.view.centerXAnchor.constraint(equalTo: parent.centerXAnchor),
                host.view.bottomAnchor.constraint(equalTo: parent.safeAreaLayoutGuide.bottomAnchor, constant: -8),
                host.view.widthAnchor.constraint(lessThanOrEqualTo: parent.widthAnchor, constant: -32),
                preferredWidth,
                host.view.widthAnchor.constraint(lessThanOrEqualToConstant: 520),
                host.view.heightAnchor.constraint(greaterThanOrEqualToConstant: 68)
            ])
            floatingHost = host
            NotificationCenter.default.addObserver(self, selector: #selector(chromeKeyboard(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
        }
        floatingHost?.view.isUserInteractionEnabled = !modal
        floatingHost?.view.accessibilityElementsHidden = modal
        navigationController?.navigationBar.accessibilityIdentifier = "split-native-navigation"
        let appearance = UINavigationBarAppearance(); appearance.configureWithTransparentBackground()
        appearance.shadowColor = .clear
        navigationItem.standardAppearance = appearance; navigationItem.scrollEdgeAppearance = appearance
        navigationController?.navigationBar.tintColor = UIColor.splitAccent
        let titleLabel = UILabel(); titleLabel.font = .preferredFont(forTextStyle: .headline); titleLabel.adjustsFontForContentSizeCategory = true
        titleLabel.text = section == "history" ? "Split" : title
        titleLabel.lineBreakMode = .byTruncatingTail; titleLabel.adjustsFontSizeToFitWidth = true; titleLabel.minimumScaleFactor = 0.8
        titleLabel.accessibilityLabel = section == "history" ? "Split, история расчётов" : title + (section == "results" ? ", итоги" : ", расчёт")
        let subtitle = UILabel(); subtitle.font = .preferredFont(forTextStyle: .caption2); subtitle.adjustsFontForContentSizeCategory = true; subtitle.textColor = .secondaryLabel
        subtitle.text = section == "history" ? "ОБЩИЕ ПЛАНЫ · ЯСНЫЕ ИТОГИ" : section == "results" ? "ИТОГИ" : "РАСЧЁТ"
        subtitle.isHidden = traitCollection.preferredContentSizeCategory.isAccessibilityCategory
        let logo = UIImageView(image: UIImage(systemName: "arrow.left.arrow.right")); logo.tintColor = .splitAccent; logo.contentMode = .scaleAspectFit
        logo.widthAnchor.constraint(equalToConstant: 22).isActive = true; logo.heightAnchor.constraint(equalToConstant: 22).isActive = true
        logo.isHidden = section != "history"; logo.isAccessibilityElement = false
        let wordmark = UIStackView(arrangedSubviews: [logo, titleLabel]); wordmark.axis = .horizontal; wordmark.spacing = 7; wordmark.alignment = .center
        let stack = UIStackView(arrangedSubviews: [wordmark, subtitle]); stack.axis = .vertical; stack.alignment = .center; stack.spacing = 2
        stack.accessibilityIdentifier = "native-navigation-title"
        stack.widthAnchor.constraint(lessThanOrEqualToConstant: max(120, view.bounds.width - 180)).isActive = true
        navigationItem.titleView = stack
        let theme = UIBarButtonItem(image: UIImage(systemName: dark ? "sun.max" : "moon"), primaryAction: UIAction(title: "Переключить тему") { [weak plugin] _ in plugin?.action("theme") })
        theme.accessibilityLabel = "Переключить тему"; theme.accessibilityIdentifier = "native-theme"
        let actions: [UIAction] = section == "history" ? [
            UIAction(title: "Новый расчёт", image: UIImage(systemName: "plus")) { [weak plugin] _ in plugin?.action("create") },
            UIAction(title: "Импорт JSON", image: UIImage(systemName: "square.and.arrow.down")) { [weak plugin] _ in plugin?.action("import") },
            UIAction(title: "Экспорт истории", image: UIImage(systemName: "square.and.arrow.up")) { [weak plugin] _ in plugin?.action("exportAll") }
        ] : [
            UIAction(title: "Переименовать", image: UIImage(systemName: "pencil")) { [weak plugin] _ in plugin?.action("rename") },
            UIAction(title: "Сменить режим", image: UIImage(systemName: "arrow.triangle.2.circlepath")) { [weak plugin] _ in plugin?.action("mode") },
            UIAction(title: "Экспорт JSON", image: UIImage(systemName: "square.and.arrow.up")) { [weak plugin] _ in plugin?.action("export") },
            UIAction(title: "Сбросить суммы", image: UIImage(systemName: "arrow.counterclockwise"), attributes: .destructive) { [weak plugin] _ in plugin?.action("reset") }
        ]
        let more = UIBarButtonItem(image: UIImage(systemName: "ellipsis"), menu: UIMenu(children: actions)); more.accessibilityLabel = "Действия"; more.accessibilityIdentifier = "native-actions"
        navigationItem.rightBarButtonItems = [more, theme]
        navigationItem.leftBarButtonItem = section == "history" ? nil : UIBarButtonItem(image: UIImage(systemName: "chevron.left"), primaryAction: UIAction(title: "История") { [weak plugin] _ in plugin?.action("back") })
        navigationItem.leftBarButtonItem?.accessibilityLabel = "Вернуться в историю"
        for button in navigationItem.rightBarButtonItems ?? [] { button.isEnabled = !modal }
        navigationItem.leftBarButtonItem?.isEnabled = !modal
        titleLabel.alpha = scrolled ? 0.88 : 1
    }
    @objc func chromeKeyboard(_ note: Notification) {
        guard let frame = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect, let window = view.window else { return }
        floatingHost?.view.isHidden = frame.minY < window.bounds.height - 50
    }
}
