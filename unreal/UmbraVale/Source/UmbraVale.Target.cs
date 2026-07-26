using UnrealBuildTool;
using System.Collections.Generic;

public class UmbraValeTarget : TargetRules
{
	public UmbraValeTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		// Latest keeps the target valid on any 5.x engine — pinning a specific
		// version triggers the "Target Upgrade Required" prompt on newer ones.
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("UmbraVale");
	}
}
