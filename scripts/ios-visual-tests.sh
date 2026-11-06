#!/usr/bin/env bash
set -euo pipefail
profile=${1:-standard}
case "$profile" in standard|compact) ;; *) exit 2 ;; esac
ruby scripts/add-ios-visual-tests.rb
trap 'xcrun xcresulttool export attachments --path ios/visual-artifacts/Visual.xcresult --output-path ios/visual-artifacts/screenshots || true' EXIT
mkdir -p ios/visual-artifacts
# Each profile runs on its own clean runner. Do not shut down/reuse the tested
# device to create another: CoreSimulator can hang after successful XCTest.
sim_id=$(python3 - "$profile" <<'PY'
import json,subprocess,sys
r=json.loads(subprocess.check_output(['xcrun','simctl','list','devices','available','-j'],timeout=90))
choices=[(runtime,d) for runtime,devices in r['devices'].items() if 'iOS-26' in runtime for d in devices if d['name'].startswith('iPhone')]
if not choices: raise SystemExit('No available iOS 26 iPhone Simulator')
choices.sort(key=lambda item: (item[0], 'Pro' in item[1]['name']),reverse=True)
runtime,device=choices[0]
if sys.argv[1]=='compact':
 print(subprocess.check_output(['xcrun','simctl','create','Split-Compact','com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation',runtime],text=True,timeout=90).strip())
else: print(device['udid'])
PY
)
echo "Booting $profile Simulator $sim_id"
python3 - "$sim_id" <<'PY'
import subprocess,sys
subprocess.run(['xcrun','simctl','boot',sys.argv[1]],timeout=90,check=False)
subprocess.run(['xcrun','simctl','bootstatus',sys.argv[1],'-b'],timeout=600,check=True)
PY
if [[ "$profile" == compact ]]; then
  selection=(-only-testing:SplitVisualTests/SplitVisualTests/testSmallScreenShare)
else
  selection=(-skip-testing:SplitVisualTests/SplitVisualTests/testSmallScreenShare)
fi
echo "Running $profile interaction regression"
xcodebuild -project ios/App/App.xcodeproj -scheme SplitVisualTests \
  -parallel-testing-enabled NO -configuration Debug -destination "platform=iOS Simulator,id=$sim_id" \
  -derivedDataPath ios/DerivedData -resultBundlePath ios/visual-artifacts/Visual.xcresult \
  "${selection[@]}" CODE_SIGNING_ALLOWED=NO test
