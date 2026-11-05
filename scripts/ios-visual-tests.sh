#!/usr/bin/env bash
set -euo pipefail
ruby scripts/add-ios-visual-tests.rb
trap 'xcrun xcresulttool export attachments --path ios/visual-artifacts/Visual.xcresult --output-path ios/visual-artifacts/screenshots || true' EXIT
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
  -derivedDataPath ios/VisualDerivedData -resultBundlePath ios/visual-artifacts/Visual.xcresult \
  CODE_SIGNING_ALLOWED=NO test
