using UnrealBuildTool;
using System.Collections.Generic;

public class UmbraValeEditorTarget : TargetRules
{
	public UmbraValeEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("UmbraVale");
	}
}
