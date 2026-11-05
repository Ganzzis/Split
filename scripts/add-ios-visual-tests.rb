require 'xcodeproj'
project = Xcodeproj::Project.open('ios/App/App.xcodeproj')
target = project.new_target(:ui_test_bundle, 'SplitVisualTests', :ios, '16.0')
app = project.targets.find { |t| t.name == 'App' }
target.add_dependency(app)
group = project.main_group.new_group('VisualTests', '../VisualTests')
file = group.new_file('SplitVisualTests.swift')
target.source_build_phase.add_file_reference(file)
target.build_configurations.each do |config|
  config.build_settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'io.github.ganzzis.split.visualtests'
  config.build_settings['TEST_TARGET_NAME'] = 'App'
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
  config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
end
project.root_object.attributes['TargetAttributes'] ||= {}
project.root_object.attributes['TargetAttributes'][target.uuid] = { 'TestTargetID' => app.uuid }
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app)
scheme.add_build_target(target)
scheme.add_test_target(target)
scheme.set_launch_target(app)
scheme.save_as('ios/App/App.xcodeproj', 'SplitVisualTests', true)
