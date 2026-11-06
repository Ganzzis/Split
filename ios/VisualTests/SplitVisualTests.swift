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
    func revealWebButton(_ button: XCUIElement, in app: XCUIApplication) {
        let web = app.webViews.firstMatch
        for _ in 0..<12 {
            let top = web.frame.minY + 8
            let bottom = app.buttons["native-tab-history"].frame.minY - 12
            let frame = button.frame
            if frame.minY >= top && frame.maxY <= bottom && button.isHittable { return }
            let downward = frame.minY < top
            let origin = app.coordinate(withNormalizedOffset: .zero)
            let start = top + (bottom - top) * (downward ? 0.3 : 0.7)
            let end = top + (bottom - top) * (downward ? 0.7 : 0.3)
            origin.withOffset(CGVector(dx: web.frame.midX, dy: start)).press(forDuration: 0.1,
                thenDragTo: origin.withOffset(CGVector(dx: web.frame.midX, dy: end)))
        }
        XCTAssertTrue(button.isHittable)
        XCTAssertGreaterThanOrEqual(button.frame.minY, web.frame.minY + 8)
        XCTAssertLessThanOrEqual(button.frame.maxY, app.buttons["native-tab-history"].frame.minY - 12)
    }
    func previewBounds(_ app: XCUIApplication) -> CGRect {
        let web = app.webViews.firstMatch
        let close = app.webViews.buttons["Закрыть обмен"].firstMatch
        let title = app.webViews.staticTexts["Поделиться результатом"].firstMatch
        let top = max(close.frame.maxY, title.frame.maxY) + 12
        let bottom = app.webViews.buttons["Отправить через систему"].firstMatch.frame.minY - 12
        return CGRect(x: 24, y: top, width: web.frame.width - 48, height: bottom - top)
    }
    func revealPreviewControl(_ control: XCUIElement, in app: XCUIApplication) {
        XCTAssertTrue(control.waitForExistence(timeout: 10))
        for _ in 0..<12 {
            let bounds = previewBounds(app), frame = control.frame
            if frame.minY >= bounds.minY && frame.maxY <= bounds.maxY && control.isHittable { return }
            let downward = frame.minY < bounds.minY
            let origin = app.coordinate(withNormalizedOffset: .zero)
            let start = bounds.minY + bounds.height * (downward ? 0.3 : 0.7)
            let end = bounds.minY + bounds.height * (downward ? 0.7 : 0.3)
            origin.withOffset(CGVector(dx: bounds.midX, dy: start)).press(forDuration: 0.1,
                thenDragTo: origin.withOffset(CGVector(dx: bounds.midX, dy: end)))
        }
        let bounds = previewBounds(app)
        XCTAssertTrue(control.isHittable)
        XCTAssertGreaterThanOrEqual(control.frame.minY, bounds.minY)
        XCTAssertLessThanOrEqual(control.frame.maxY, bounds.maxY)
    }
    func copySystemShare(_ app: XCUIApplication, screenshot: String) {
        let remote = app.otherElements["ShareSheet.RemoteContainerView"].firstMatch
        XCTAssertTrue(remote.waitForExistence(timeout: 30), "A real system Share controller must be presented")
        let names = ["Копировать", "Скопировать", "Copy"]
        let predicate = NSPredicate(format: "label IN %@", names as NSArray)
        let copyCell = app.cells.matching(predicate).firstMatch
        let copyButton = app.buttons.matching(predicate).firstMatch
        // iOS 26 groups actions behind More in compact Accessibility layouts.
        // Restrict this to the actions group, not the separate More-apps button.
        let more = app.cells.matching(NSPredicate(format: "identifier == 'actionGroupCell' AND label IN %@", ["More", "Ещё", "Еще"] as NSArray)).firstMatch
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in copyCell.exists || copyButton.exists || more.exists }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed)
        if !copyCell.exists && !copyButton.exists { XCTAssertTrue(more.isHittable); more.tap() }
        let expanded = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in copyCell.exists || copyButton.exists }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [expanded], timeout: 30), .completed)
        let action = copyCell.exists ? copyCell : copyButton
        XCTAssertTrue(action.isHittable); capture(app, screenshot); action.tap()
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: remote); waitForExpectations(timeout: 20)
    }
    func runFlow(theme: String, largeType: Bool = false) {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--split-ui-tests", "-AppleLanguages", "(ru)", "-AppleLocale", "ru_RU"]
        if largeType { app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXL"] }
        app.launchEnvironment["SPLIT_UI_TEST_FIXTURE"] = fixture(); app.launchEnvironment["SPLIT_UI_TEST_THEME"] = theme
        app.launch()
        XCTAssertTrue(app.buttons["native-tab-history"].waitForExistence(timeout: 90))
        XCTAssertTrue(app.navigationBars["split-native-navigation"].exists)
        let create = app.webViews.buttons["Новый расчёт"].firstMatch
        XCTAssertTrue(create.waitForExistence(timeout: 20)); expectation(for: NSPredicate(format: "hittable == true"), evaluatedWith: create); waitForExpectations(timeout: 20)
        capture(app, "\(theme)-01-history-top")
        let web = app.webViews.firstMatch
        web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.75)).press(forDuration: 0.1, thenDragTo: web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.35)))
        capture(app, "\(theme)-02-history-scrolled")
        let open = app.webViews.buttons["Открыть"].firstMatch
        XCTAssertTrue(open.waitForExistence(timeout: 10)); revealWebButton(open, in: app); open.tap()
        let results = app.buttons["native-tab-results"]
        XCTAssertTrue(results.waitForExistence(timeout: 10)); expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: results); waitForExpectations(timeout: 20)
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
        XCTAssertTrue(app.navigationBars.staticTexts.matching(NSPredicate(format: "label ENDSWITH ', итоги'")).firstMatch.waitForExistence(timeout: 10))
        capture(app, "\(theme)-05-results")
        let share = app.webViews.buttons["Поделиться"].firstMatch
        XCTAssertTrue(share.waitForExistence(timeout: 10)); revealWebButton(share, in: app); share.tap()
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
        copySystemShare(app, screenshot: "\(theme)-07-system-share")
        XCTAssertTrue(system.waitForExistence(timeout: 15))
        XCTAssertTrue(app.webViews.staticTexts["native-tabs-hidden"].exists)
        let png = app.webViews.links["Отправить эту PNG-страницу"].firstMatch
        // PNG-only sharing also exercises Filesystem/File URL → real UIActivityViewController.
        revealPreviewControl(png, in: app)
        png.tap(); copySystemShare(app, screenshot: "\(theme)-07a-selected-png-system-share")
        let textPreview = app.webViews.descendants(matching: .any).matching(NSPredicate(format: "label == 'Текст отчёта'")).firstMatch
        revealPreviewControl(textPreview, in: app); textPreview.tap()
        let reportText = app.webViews.textViews.firstMatch
        XCTAssertTrue(reportText.waitForExistence(timeout: 10), "The details control must actually expand the report")
        let close = app.webViews.buttons["Закрыть обмен"].firstMatch
        let textOnly = app.webViews.buttons["Отправить только текст"].firstMatch
        revealPreviewControl(textOnly, in: app); textOnly.tap()
        copySystemShare(app, screenshot: "\(theme)-07b-text-only-system-share")
        let scrollBounds = previewBounds(app)
        let reportLabel = app.webViews.staticTexts["Отчёт для мессенджера"].firstMatch
        // Start a parent scroll on the label/action, never inside a readonly textarea:
        // the latter legitimately scrolls its own long content instead of the sheet.
        for _ in 0..<12 {
            if reportText.frame.intersection(scrollBounds).height > 60 { break }
            let handle = [reportLabel, textOnly].first { $0.exists && $0.frame.intersection(scrollBounds).height > 8 }
            if let handle {
                let visible = handle.frame.intersection(scrollBounds)
                let origin = app.coordinate(withNormalizedOffset: .zero)
                origin.withOffset(CGVector(dx: visible.midX, dy: visible.midY)).press(forDuration: 0.1,
                    thenDragTo: origin.withOffset(CGVector(dx: scrollBounds.midX, dy: scrollBounds.minY + 5)))
            } else { drag(app, in: scrollBounds) }
        }
        let visibleText = reportText.frame.intersection(scrollBounds)
        XCTAssertGreaterThan(visibleText.height, 30, "Long report must be reachable inside the preview scroll area")
        drag(app, in: visibleText)
        XCTAssertTrue(copy.isHittable); XCTAssertTrue(system.isHittable)
        capture(app, "\(theme)-07c-long-text-preview")
        XCTAssertTrue(close.isHittable); close.tap()
        XCTAssertTrue(app.webViews.staticTexts["native-tabs-visible"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["native-tab-history"].isHittable)
        app.buttons["native-tab-history"].tap()
        capture(app, "\(theme)-08-tabs-restored")
        let delete = app.webViews.buttons["Удалить"].firstMatch
        revealWebButton(delete, in: app); delete.tap()
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
        XCTAssertTrue(app.buttons["native-tab-history"].waitForExistence(timeout: 90))
        XCTAssertTrue(app.buttons["native-theme"].isHittable)
        capture(app, "accessibility-large-type-history")
        app.terminate()
    }
    func testLight() { runFlow(theme: "light") }
    func testDark() { runFlow(theme: "dark") }
}
