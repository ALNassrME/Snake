#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "SnakeHUD.generated.h"

/** Minimal canvas HUD: score, best, and the death beat message. */
UCLASS()
class ASnakeHUD : public AHUD
{
	GENERATED_BODY()

public:
	virtual void DrawHUD() override;
};
