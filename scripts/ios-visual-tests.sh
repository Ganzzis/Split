#!/usr/bin/env bash
set -euo pipefail
ruby scripts/add-ios-visual-tests.rb
trap 'for result in ios/visual-artifacts/*.xcresult; do xcrun xcresulttool export attachments --path "$result" --output-path "${result%.xcresult}-screenshots" || true; done' EXIT
mkdir -p ios/visual-artifacts
sim_id=$(python3 - <<'PY'
import json,subprocess
r=json.loads(subprocess.check_output(['xcrun','simctl','list','devices','available','-j']))
choices=[(runtime,d) for runtime,devices in r['devices'].items() if 'iOS-26' in runtime for d in devices if d['name'].startswith('iPhone')]
if not choices: raise SystemExit('No available iOS 26 iPhone Simulator')
choices.sort(key=lambda item: (item[0], 'Pro' in item[1]['name']),reverse=True)
print(choices[0][1]['udid'])
PY
)
xcrun simctl boot "$sim_id" || true
xcrun simctl bootstatus "$sim_id" -b
xcrun simctl status_bar "$sim_id" override --time '9:41' --dataNetwork wifi --wifiMode active --wifiBars 3 --batteryState charged --batteryLevel 100
xcodebuild -project ios/App/App.xcodeproj -scheme SplitVisualTests \
  -parallel-testing-enabled NO -configuration Debug -destination "platform=iOS Simulator,id=$sim_id" \
  -derivedDataPath ios/DerivedData -resultBundlePath ios/visual-artifacts/Visual.xcresult \
  -skip-testing:SplitVisualTests/SplitVisualTests/testSmallScreenShare CODE_SIGNING_ALLOWED=NO test

# A real compact Simulator, with Accessibility XL text, not merely a resized screenshot.
runtime=$(xcrun simctl list runtimes -j | python3 -c 'import json,sys; print(next(r["identifier"] for r in json.load(sys.stdin)["runtimes"] if r["isAvailable"] and "iOS-26" in r["identifier"]))')
xcrun simctl shutdown "$sim_id" || true
small_id=$(xcrun simctl create Split-Compact com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation "$runtime")
xcrun simctl boot "$small_id"
xcrun simctl bootstatus "$small_id" -b
xcodebuild -project ios/App/App.xcodeproj -scheme SplitVisualTests \
  -parallel-testing-enabled NO -configuration Debug -destination "platform=iOS Simulator,id=$small_id" \
  -derivedDataPath ios/DerivedData -resultBundlePath ios/visual-artifacts/Compact.xcresult \
  -only-testing:SplitVisualTests/SplitVisualTests/testSmallScreenShare CODE_SIGNING_ALLOWED=NO test
