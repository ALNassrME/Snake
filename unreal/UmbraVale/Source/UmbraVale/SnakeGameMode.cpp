#include "SnakeGameMode.h"
#include "FoodActor.h"
#include "SnakeHUD.h"
#include "SnakePawn.h"
#include "ValeProp.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/SkyLightComponent.h"
#include "Engine/DirectionalLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/SkyLight.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Kismet/GameplayStatics.h"
#include "TimerManager.h"

namespace
{
	UStaticMesh* LoadShape(const TCHAR* Name)
	{
		return LoadObject<UStaticMesh>(nullptr, Name);
	}
}

ASnakeGameMode::ASnakeGameMode()
{
	DefaultPawnClass = ASnakePawn::StaticClass();
	HUDClass = ASnakeHUD::StaticClass();
	Rng.Initialize(0xBADFACE);
}

void ASnakeGameMode::BeginPlay()
{
	Super::BeginPlay();
	BuildEnvironment();
	SpawnBoulders();
	SpawnBoundary();
	SpawnFood(5);
}

void ASnakeGameMode::BuildEnvironment()
{
	UWorld* World = GetWorld();

	// --- night atmosphere -------------------------------------------------
	// A dim, cold "moon" drives both the sky colour and volumetric fog.
	ADirectionalLight* Moon = World->SpawnActor<ADirectionalLight>(
		FVector::ZeroVector, FRotator(-48.f, 35.f, 0.f));
	if (Moon)
	{
		Moon->SetMobility(EComponentMobility::Movable);
		if (UDirectionalLightComponent* L =
				Cast<UDirectionalLightComponent>(Moon->GetLightComponent()))
		{
			L->SetIntensity(3.f);
			L->SetLightColor(FLinearColor(0.55f, 0.72f, 1.f));
			L->SetVolumetricScatteringIntensity(2.f);
		}
	}

	// Sky atmosphere turns the dim sun into a deep night gradient. Spawned as
	// a bare actor + component to stay asset-free.
	AActor* SkyHolder = World->SpawnActor<AActor>();
	if (SkyHolder)
	{
		USceneComponent* SkyRoot = NewObject<USceneComponent>(SkyHolder, TEXT("Root"));
		SkyHolder->SetRootComponent(SkyRoot);
		SkyRoot->RegisterComponent();
		USkyAtmosphereComponent* Atmo =
			NewObject<USkyAtmosphereComponent>(SkyHolder, TEXT("Atmosphere"));
		Atmo->SetupAttachment(SkyRoot);
		Atmo->RegisterComponent();
	}

	ASkyLight* Sky = World->SpawnActor<ASkyLight>();
	if (Sky)
	{
		if (USkyLightComponent* S = Sky->GetLightComponent())
		{
			S->SetMobility(EComponentMobility::Movable);
			// One capture, not a per-frame one: the sky never changes here, and
			// real-time capture costs a cubemap render every frame.
			S->bRealTimeCapture = false;
			S->SetIntensity(1.2f);
			S->RecaptureSky();
		}
	}

	AExponentialHeightFog* Fog = World->SpawnActor<AExponentialHeightFog>();
	if (Fog)
	{
		if (UExponentialHeightFogComponent* F = Fog->GetComponent())
		{
			F->SetFogDensity(0.035f);
			F->SetFogHeightFalloff(0.35f);
			F->SetVolumetricFog(true);
			F->SetFogInscatteringColor(FLinearColor(0.04f, 0.09f, 0.11f));
		}
	}

	// --- ground -----------------------------------------------------------
	if (AValeProp* Floor = World->SpawnActor<AValeProp>(FVector::ZeroVector, FRotator::ZeroRotator))
	{
		Floor->Init(LoadShape(TEXT("/Engine/BasicShapes/Plane.Plane")),
			FLinearColor(0.015f, 0.028f, 0.035f), FVector(120.f, 120.f, 1.f));
	}
}

void ASnakeGameMode::SpawnBoulders()
{
	UWorld* World = GetWorld();
	UStaticMesh* Sphere = LoadShape(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	for (int32 i = 0; i < 10; i++)
	{
		const float Ang = Rng.FRandRange(0.f, 2.f * PI);
		const float Dist = Rng.FRandRange(ArenaRadius * 0.25f, ArenaRadius * 0.85f);
		const FVector2D P(FMath::Cos(Ang) * Dist, FMath::Sin(Ang) * Dist);
		if (P.Size() < 700.f) { continue; } // keep the spawn area clear
		const float R = Rng.FRandRange(120.f, 260.f);
		AValeProp* Rock = World->SpawnActor<AValeProp>(
			FVector(P.X, P.Y, R * 0.55f), FRotator(0.f, Rng.FRandRange(0.f, 360.f), 0.f));
		if (!Rock) { continue; }
		Rock->Init(Sphere, FLinearColor(0.05f, 0.05f, 0.065f),
			FVector(R / 50.f, R / 50.f, R / 62.f));
		if (i % 3 == 0)
		{
			// Only every third boulder carries rune-glow: each dynamic light also
			// injects into the volumetric fog, so they add up fast.
			Rock->AddGlow(FLinearColor(0.35f, 0.9f, 0.75f), 900.f, R * 3.f, R * 0.6f);
		}
		Rocks.Add({ P, R });
	}
}

void ASnakeGameMode::SpawnBoundary()
{
	UWorld* World = GetWorld();
	UStaticMesh* Cylinder = LoadShape(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	const int32 Count = 26;
	for (int32 i = 0; i < Count; i++)
	{
		const float Ang = (float(i) / Count) * 2.f * PI;
		const FVector Pos(FMath::Cos(Ang) * ArenaRadius, FMath::Sin(Ang) * ArenaRadius, 0.f);
		const float H = (i % 2 == 0) ? 5.2f : 3.4f;
		AValeProp* Pillar = World->SpawnActor<AValeProp>(Pos, FRotator::ZeroRotator);
		if (!Pillar) { continue; }
		Pillar->Init(Cylinder, FLinearColor(0.04f, 0.05f, 0.07f), FVector(1.1f, 1.1f, H));
		if (i % 4 == 0)
		{
			// Lantern pillars: the ring of light that reads as the arena edge.
			// Every fourth pillar only — dynamic lights are the dominant cost
			// once volumetric fog and Lumen are both on.
			Pillar->AddGlow(FLinearColor(0.4f, 0.95f, 0.8f), 2600.f, 1500.f, H * 55.f);
		}
	}
}

void ASnakeGameMode::SpawnFood(int32 Count)
{
	for (int32 i = 0; i < Count; i++)
	{
		AFoodActor* Food = GetWorld()->SpawnActor<AFoodActor>(
			FindFoodSpot(), FRotator::ZeroRotator);
		if (Food) { Foods.Add(Food); }
	}
}

FVector ASnakeGameMode::FindFoodSpot() const
{
	FRandomStream& R = const_cast<FRandomStream&>(Rng);
	for (int32 Attempt = 0; Attempt < 40; Attempt++)
	{
		const float Ang = R.FRandRange(0.f, 2.f * PI);
		const float Dist = R.FRandRange(ArenaRadius * 0.15f, ArenaRadius * 0.9f);
		const FVector2D P(FMath::Cos(Ang) * Dist, FMath::Sin(Ang) * Dist);
		bool bClear = true;
		for (const FValeRock& Rock : Rocks)
		{
			if (FVector2D::Distance(P, Rock.Pos) < Rock.Radius + 260.f) { bClear = false; break; }
		}
		if (bClear) { return FVector(P.X, P.Y, 70.f); }
	}
	return FVector(0.f, ArenaRadius * 0.4f, 70.f);
}

void ASnakeGameMode::ConsumeFood(AFoodActor* Food)
{
	Score += 10;
	BestScore = FMath::Max(BestScore, Score);
	if (Food)
	{
		Food->SetActorLocation(FindFoodSpot());
		Food->Reroll();
	}
}

void ASnakeGameMode::NotifyDeath()
{
	if (bRunOver) { return; }
	bRunOver = true;
	// Slow-motion death beat, then the vale rebuilds the wyrm.
	UGameplayStatics::SetGlobalTimeDilation(this, 0.35f);
	GetWorldTimerManager().SetTimer(
		RestartTimer, this, &ASnakeGameMode::RestartRun, 0.9f, false);
}

void ASnakeGameMode::RestartRun()
{
	UGameplayStatics::SetGlobalTimeDilation(this, 1.f);
	bRunOver = false;
	Score = 0;
	if (ASnakePawn* Pawn = Cast<ASnakePawn>(
			UGameplayStatics::GetPlayerPawn(this, 0)))
	{
		Pawn->ResetWyrm();
	}
	for (AFoodActor* Food : Foods)
	{
		if (Food) { Food->SetActorLocation(FindFoodSpot()); Food->Reroll(); }
	}
}
