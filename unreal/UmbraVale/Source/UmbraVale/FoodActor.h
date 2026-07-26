#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "FoodActor.generated.h"

class UStaticMeshComponent;
class UPointLightComponent;
class UMaterialInstanceDynamic;

/**
 * A luminous morsel: a small emissively-tinted orb with a matching point
 * light. Bobs, pulses and spins; Lumen and bloom do the rest.
 */
UCLASS()
class AFoodActor : public AActor
{
	GENERATED_BODY()

public:
	AFoodActor();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	/** Pick a fresh variety (ember / bloom / chrono palette). */
	void Reroll();

private:
	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> Orb;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UPointLightComponent> Light;

	UPROPERTY()
	TObjectPtr<UMaterialInstanceDynamic> Mid;

	FLinearColor Color = FLinearColor(1.f, 0.45f, 0.25f);
	float Phase = 0.f;
	float BaseZ = 70.f;
};
