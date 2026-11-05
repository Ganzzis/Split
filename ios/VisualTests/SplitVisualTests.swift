import XCTest

final class SplitVisualTests: XCTestCase {
    let longTitle = "Большое путешествие с друзьями — Санкт-Петербург и Карелия"
    func fixture() -> String {
        let records: [[String: Any]] = (0..<24).map { index in
            ["id": "fixture-\(index)", "name": index == 0 ? longTitle : "Встреча с друзьями · \(index)", "updatedAt": "2026-11-06T12:00:00.000Z",
             "state": ["target": "", "people": [["id": "p1", "name": "Анна", "paid": 12345.67], ["id": "p2", "name": "Борис", "paid": 0]], "transfers": [], "drafts": [:]]]
        }
        return String(data: try! JSONSerialization.data(withJSONObject: ["version": 4, "legacyMigrated": true, "records": records]), encoding: .utf8)!
    }
    func capture(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }
    func runFlow(theme: String) {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--split-ui-tests", "-AppleLanguages", "(ru)", "-AppleLocale", "ru_RU"]
        app.launchEnvironment["SPLIT_UI_TEST_FIXTURE"] = fixture(); app.launchEnvironment["SPLIT_UI_TEST_THEME"] = theme
        app.launch()
        XCTAssertTrue(app.buttons["native-tab-history"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.navigationBars["split-native-navigation"].exists)
        capture(app, "\(theme)-01-history-top")
        app.webViews.firstMatch.swipeUp(); capture(app, "\(theme)-02-history-scrolled")
        let open = app.webViews.buttons["Открыть"].firstMatch
        XCTAssertTrue(open.waitForExistence(timeout: 10)); open.tap()
        let results = app.buttons["native-tab-results"]
        XCTAssertTrue(results.waitForExistence(timeout: 10)); expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: results); waitForExpectations(timeout: 10)
        capture(app, "\(theme)-03-calculation-long-title")
        app.buttons["native-actions"].tap(); app.buttons["Переименовать"].tap()
        let field = app.textFields["Название расчёта"]
        XCTAssertTrue(field.waitForExistence(timeout: 10)); field.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        capture(app, "\(theme)-04-native-rename-keyboard")
        app.buttons["Отмена"].firstMatch.tap()
        XCTAssertTrue(results.waitForExistence(timeout: 10)); results.tap()
        XCTAssertTrue(app.navigationBars.staticTexts["ИТОГИ"].waitForExistence(timeout: 10))
        capture(app, "\(theme)-05-results")
        let share = app.webViews.buttons["Поделиться"].firstMatch
        XCTAssertTrue(share.waitForExistence(timeout: 10)); share.tap()
        let system = app.webViews.buttons["Отправить через систему"].firstMatch
        XCTAssertTrue(system.waitForExistence(timeout: 20))
        let ready = NSPredicate(format: "enabled == true")
        expectation(for: ready, evaluatedWith: system); waitForExpectations(timeout: 30)
        capture(app, "\(theme)-06-share-preview")
        system.tap()
        // Real UIActivityViewController, not a mocked bridge. Screenshot records available Simulator targets.
        sleep(2)
        capture(app, "\(theme)-07-system-share")
        app.terminate()
    }
    func testLight() { runFlow(theme: "light") }
    func testDark() { runFlow(theme: "dark") }
}
