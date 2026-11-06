import XCTest

final class SplitVisualTests: XCTestCase {
    let longTitle = "Большое путешествие с друзьями — Санкт-Петербург и Карелия"
    func fixture() -> String {
        let records: [[String: Any]] = (0..<24).map { index in
            var people: [[String: Any]] = [["id": "p1", "name": "Анна", "paid": index == 0 ? 0 : 12345.67], ["id": "p2", "name": "Борис", "paid": 0]]
            if index == 0 { people += (3...24).map { ["id": "p\($0)", "name": "Участник \($0)", "paid": 0] as [String: Any] } }
            var state: [String: Any] = ["target": "", "people": people, "transfers": [], "drafts": [:]]
            if index == 0 {
                state["mode"] = "items"; state["payments"] = []
                state["expenses"] = (0..<32).map { number -> [String: Any] in
                    ["id": "expense-\(number)", "title": "Кофе, прогулки и общие планы · \(number+1)", "amount": "450.01", "payerId": "p1", "split": "equal", "shares": people.map { ["personId": $0["id"]!, "value": ""] }]
                }
            }
            return ["id": "fixture-\(index)", "name": index == 0 ? longTitle : "Встреча с друзьями · \(index)", "updatedAt": "2026-11-06T12:00:00.000Z", "state": state]
        }
        return String(data: try! JSONSerialization.data(withJSONObject: ["version": 5, "legacyMigrated": true, "records": records]), encoding: .utf8)!
    }
    func capture(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }
    func cancelIntent(_ app: XCUIApplication, menuTitle: String) {
        app.buttons["native-actions"].tap(); app.buttons[menuTitle].tap()
        let cancel = app.buttons["Отмена"].firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 10)); XCTAssertTrue(cancel.isHittable)
        XCTAssertFalse(app.buttons["native-tab-results"].exists)
        cancel.tap()
        expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: app.buttons["native-actions"]); waitForExpectations(timeout: 15)
        XCTAssertTrue(app.buttons["native-tab-results"].isHittable)
    }
    func drag(_ app: XCUIApplication, in rect: CGRect) {
        XCTAssertGreaterThan(rect.height, 30)
        let origin = app.coordinate(withNormalizedOffset: .zero)
        origin.withOffset(CGVector(dx: rect.midX, dy: rect.maxY - 10)).press(forDuration: 0.1,
            thenDragTo: origin.withOffset(CGVector(dx: rect.midX, dy: rect.minY + 10)))
    }
    func runFlow(theme: String, largeType: Bool = false) {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--split-ui-tests", "-AppleLanguages", "(ru)", "-AppleLocale", "ru_RU"]
        if largeType { app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXL"] }
        app.launchEnvironment["SPLIT_UI_TEST_FIXTURE"] = fixture(); app.launchEnvironment["SPLIT_UI_TEST_THEME"] = theme
        app.launch()
        XCTAssertTrue(app.buttons["native-tab-history"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.navigationBars["split-native-navigation"].exists)
        let create = app.webViews.buttons["Новый расчёт"].firstMatch
        XCTAssertTrue(create.waitForExistence(timeout: 20)); expectation(for: NSPredicate(format: "hittable == true"), evaluatedWith: create); waitForExpectations(timeout: 20)
        capture(app, "\(theme)-01-history-top")
        let web = app.webViews.firstMatch
        web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.75)).press(forDuration: 0.1, thenDragTo: web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.35)))
        capture(app, "\(theme)-02-history-scrolled")
        let open = app.webViews.buttons["Открыть"].firstMatch
        XCTAssertTrue(open.waitForExistence(timeout: 10)); if !open.isHittable { web.swipeUp() }; XCTAssertTrue(open.isHittable); open.tap()
        let results = app.buttons["native-tab-results"]
        XCTAssertTrue(results.waitForExistence(timeout: 10)); expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: results); waitForExpectations(timeout: 10)
        capture(app, "\(theme)-03-calculation-long-title")
        app.webViews.firstMatch.swipeUp(); capture(app, "\(theme)-03b-long-expense-list")
        app.buttons["native-actions"].tap(); app.buttons["Переименовать"].tap()
        let field = app.textFields["Название расчёта"]
        XCTAssertTrue(field.waitForExistence(timeout: 10)); field.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        capture(app, "\(theme)-04-native-rename-keyboard")
        app.buttons["Отмена"].firstMatch.tap()
        XCTAssertTrue(results.waitForExistence(timeout: 10)); expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: app.buttons["native-actions"]); waitForExpectations(timeout: 10)
        cancelIntent(app, menuTitle: "Сбросить суммы")
        cancelIntent(app, menuTitle: "Сменить режим")
        results.tap()
        XCTAssertTrue(app.navigationBars.staticTexts["ИТОГИ"].waitForExistence(timeout: 10))
        capture(app, "\(theme)-05-results")
        let share = app.webViews.buttons["Поделиться"].firstMatch
        XCTAssertTrue(share.waitForExistence(timeout: 10)); share.tap()
        let system = app.webViews.buttons["Отправить через систему"].firstMatch
        XCTAssertTrue(system.waitForExistence(timeout: 20))
        let ready = NSPredicate(format: "enabled == true")
        expectation(for: ready, evaluatedWith: system); waitForExpectations(timeout: 30)
        XCTAssertTrue(app.webViews.staticTexts["native-tabs-hidden"].waitForExistence(timeout: 10), "UIKit must actually hide the sibling tab view")
        XCTAssertFalse(app.buttons["native-tab-history"].exists)
        let copy = app.webViews.buttons["Копировать текст"].firstMatch
        XCTAssertTrue(copy.isHittable); XCTAssertTrue(system.isHittable)
        copy.tap()
        XCTAssertTrue(app.webViews.staticTexts["Текст отчёта скопирован."].waitForExistence(timeout: 10), "Real copy button must receive the tap")
        capture(app, "\(theme)-06-share-preview")
        // Scroll the long PNG preview without moving the footer actions out of reach.
        let dialogWeb = app.webViews.firstMatch
        dialogWeb.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.60)).press(forDuration: 0.1, thenDragTo: dialogWeb.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.35)))
        XCTAssertTrue(copy.isHittable); XCTAssertTrue(system.isHittable)
        capture(app, "\(theme)-06b-share-scrolled")
        system.tap()
        // Real UIActivityViewController, not a mocked bridge. Screenshot records available Simulator targets.
        var nativeCopy: XCUIElement { app.cells.matching(NSPredicate(format: "label == 'Копировать' OR label == 'Скопировать' OR label == 'Copy'")).firstMatch }
        XCTAssertTrue(nativeCopy.waitForExistence(timeout: 15))
        capture(app, "\(theme)-07-system-share")
        nativeCopy.tap()
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: nativeCopy); waitForExpectations(timeout: 15)
        XCTAssertTrue(system.waitForExistence(timeout: 15))
        XCTAssertTrue(app.webViews.staticTexts["native-tabs-hidden"].exists)
        let png = app.webViews.links["Отправить эту PNG-страницу"].firstMatch
        // PNG-only sharing also exercises Filesystem/File URL → real UIActivityViewController.
        for _ in 0..<16 {
            if png.exists && png.isHittable { break }
            dialogWeb.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.60)).press(forDuration: 0.1, thenDragTo: dialogWeb.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.30)))
        }
        XCTAssertTrue(png.isHittable, "PNG action must be reachable in scrollable preview")
        png.tap(); XCTAssertTrue(nativeCopy.waitForExistence(timeout: 30)); nativeCopy.tap()
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: nativeCopy); waitForExpectations(timeout: 15)
        let textPreview = app.webViews.descendants(matching: .any).matching(NSPredicate(format: "label == 'Текст отчёта'")).firstMatch
        for _ in 0..<12 {
            if textPreview.exists && textPreview.isHittable { break }
            dialogWeb.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.60)).press(forDuration: 0.1, thenDragTo: dialogWeb.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.30)))
        }
        XCTAssertTrue(textPreview.isHittable); textPreview.tap()
        let reportText = app.webViews.textViews.firstMatch
        XCTAssertTrue(reportText.waitForExistence(timeout: 10))
        let close = app.webViews.buttons["Закрыть обмен"].firstMatch
        let scrollBounds = CGRect(x: 24, y: close.frame.maxY + 12, width: app.frame.width - 48,
                                  height: system.frame.minY - close.frame.maxY - 24)
        for _ in 0..<12 {
            if reportText.frame.intersection(scrollBounds).height > 60 { break }
            drag(app, in: scrollBounds)
        }
        let visibleText = reportText.frame.intersection(scrollBounds)
        XCTAssertGreaterThan(visibleText.height, 30, "Long report must be reachable inside the preview scroll area")
        drag(app, in: visibleText)
        XCTAssertTrue(copy.isHittable); XCTAssertTrue(system.isHittable)
        capture(app, "\(theme)-07b-long-text-preview")
        let textOnly = app.webViews.buttons["Отправить только текст"].firstMatch
        for _ in 0..<12 {
            if textOnly.exists && textOnly.isHittable { break }
            drag(app, in: scrollBounds)
        }
        XCTAssertTrue(textOnly.isHittable); textOnly.tap()
        XCTAssertTrue(nativeCopy.waitForExistence(timeout: 30)); capture(app, "\(theme)-07c-text-only-system-share"); nativeCopy.tap()
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: nativeCopy); waitForExpectations(timeout: 15)
        XCTAssertTrue(close.isHittable); close.tap()
        XCTAssertTrue(app.webViews.staticTexts["native-tabs-visible"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["native-tab-history"].isHittable)
        app.buttons["native-tab-history"].tap()
        capture(app, "\(theme)-08-tabs-restored")
        let delete = app.webViews.buttons["Удалить"].firstMatch
        if !delete.isHittable { app.webViews.firstMatch.swipeUp() }
        XCTAssertTrue(delete.isHittable); delete.tap()
        XCTAssertTrue(app.buttons["Отмена"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["native-tab-history"].exists)
        app.buttons["Отмена"].firstMatch.tap()
        XCTAssertTrue(app.buttons["native-tab-history"].waitForExistence(timeout: 15))
        app.terminate()
    }
    func testSmallScreenShare() { runFlow(theme: "light", largeType: true) }
    func testLargeType() {
        let app = XCUIApplication()
        app.launchArguments = ["--split-ui-tests", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXL"]
        app.launchEnvironment["SPLIT_UI_TEST_FIXTURE"] = fixture(); app.launchEnvironment["SPLIT_UI_TEST_THEME"] = "light"
        app.launch()
        XCTAssertTrue(app.buttons["native-tab-history"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.buttons["native-theme"].isHittable)
        capture(app, "accessibility-large-type-history")
        app.terminate()
    }
    func testLight() { runFlow(theme: "light") }
    func testDark() { runFlow(theme: "dark") }
}
