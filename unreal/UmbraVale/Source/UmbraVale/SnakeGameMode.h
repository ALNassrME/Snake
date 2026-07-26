#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "SnakeGameMode.generated.h"

class AValeProp;
class AFoodActor;

/** A boulder the wyrm must not touch: position + collision radius. */
struct FValeRock
{
	FVector2D Pos = FVector2D::ZeroVector;
	float Radius = 0.f;
};

/**
 * Builds the entire vale at runtime — night sky, moonlight, volumetric fog,
 * arena, boulders, boundary pillars, food — and owns score and run state.
 * No map assets: the engine's empty Entry level is dressed from code.
 */
UCLASS()
class ASnakeGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	ASnakeGameMode();

	virtual void BeginPlay() override;

	/** Called by the pawn when its head reaches a food orb. */
	void ConsumeFood(AFoodActor* Food);

	/** Called by the pawn on death; slows time and schedules the reset. */
	void NotifyDeath();

	/** Immediate reset (also bound to the R key through the pawn). */
	void RestartRun();

	/** Arena radius in world units (cm). */
	float ArenaRadius = 3200.f;

	int32 Score = 0;
	int32 BestScore = 0;
	bool bRunOver = false;

	const TArray<FValeRock>& GetRocks() const { return Rocks; }

	/** The live food orbs — they are repositioned, never respawned. */
	const TArray<TObjectPtr<AFoodActor>>& GetFoods() const { return Foods; }

private:
	void BuildEnvironment();
	void SpawnBoulders();
	void SpawnBoundary();
	void SpawnFood(int32 Count);
	FVector FindFoodSpot() const;

	TArray<FValeRock> Rocks;

	UPROPERTY()
	TArray<TObjectPtr<AFoodActor>> Foods;

	FTimerHandle RestartTimer;
	FRandomStream Rng;
};
