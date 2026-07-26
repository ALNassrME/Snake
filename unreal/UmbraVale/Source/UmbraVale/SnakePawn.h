#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "SnakePawn.generated.h"

class UStaticMeshComponent;
class USpringArmComponent;
class UCameraComponent;
class UPointLightComponent;
class UMaterialInstanceDynamic;

/**
 * The wyrm: a smooth-steering head whose body segments sample a recorded
 * path by arc length — the same technique as the web version, but lit by
 * Lumen and graded by Unreal's cinematic post-processing.
 */
UCLASS()
class ASnakePawn : public APawn
{
	GENERATED_BODY()

public:
	ASnakePawn();

	virtual void Tick(float DeltaSeconds) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

	/** Back to the centre with a fresh short body. */
	void ResetWyrm();

	int32 SegmentCount() const { return Segments.Num(); }

private:
	void MoveForward(float Value);
	void MoveRight(float Value);
	void RequestRestart();
	void SyncSegments();
	void UpdateSegments();
	void CheckCollisions();
	FVector SamplePath(float Distance) const;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> Head;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> EyeL;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> EyeR;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UPointLightComponent> HeadLight;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USpringArmComponent> SpringArm;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UCameraComponent> Camera;

	UPROPERTY()
	TArray<TObjectPtr<UStaticMeshComponent>> Segments;

	UPROPERTY()
	TArray<TObjectPtr<UMaterialInstanceDynamic>> SegmentMids;

	UPROPERTY()
	TObjectPtr<UMaterialInstanceDynamic> HeadMid;

	UPROPERTY()
	TObjectPtr<UStaticMesh> SphereMesh;

	/** Recorded head positions, newest first, ~10cm apart. */
	TArray<FVector> Path;

	float HeadingDeg = 90.f;
	float InputForward = 0.f;
	float InputRight = 0.f;
	float Speed = 950.f;
	float TargetLength = 8.f;
	float CurrentLength = 8.f;
	float GameTime = 0.f;
	bool bDead = false;

	static constexpr float HeadRadius = 60.f;
	static constexpr float SegmentSpacing = 78.f;
	static constexpr float PathStep = 10.f;
};
