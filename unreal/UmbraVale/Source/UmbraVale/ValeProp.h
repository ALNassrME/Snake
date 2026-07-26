#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ValeProp.generated.h"

class UStaticMeshComponent;
class UMaterialInstanceDynamic;
class UPointLightComponent;

/**
 * A generic scene prop built from an engine primitive: floor slab, boundary
 * pillar, boulder. Everything is tinted through a dynamic material instance
 * so the whole vale can be dressed without a single authored asset.
 */
UCLASS()
class AValeProp : public AActor
{
	GENERATED_BODY()

public:
	AValeProp();

	/** Assign a mesh + colour; call right after spawning. */
	void Init(UStaticMesh* Mesh, const FLinearColor& Color, const FVector& Scale);

	/** Optional accent light hovering at the prop's centre. */
	void AddGlow(const FLinearColor& Color, float Intensity, float Radius, float ZOffset = 0.f);

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> MeshComp;

	UPROPERTY()
	TObjectPtr<UMaterialInstanceDynamic> Mid;

	UPROPERTY()
	TObjectPtr<UPointLightComponent> Glow;
};
