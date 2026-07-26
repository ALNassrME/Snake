#include "SnakePawn.h"
#include "FoodActor.h"
#include "SnakeGameMode.h"
#include "Camera/CameraComponent.h"
#include "Components/InputComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/SpringArmComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	// Head-to-tail gradient: a cloak of night — dark desaturated navy that
	// deepens toward the tail, matching the porcelain-mask style.
	FLinearColor SegmentColor(float T)
	{
		const FLinearColor A(0.11f, 0.17f, 0.24f);
		const FLinearColor B(0.05f, 0.08f, 0.12f);
		return FLinearColor::LerpUsingHSV(A, B, FMath::Pow(T, 0.85f));
	}
}

ASnakePawn::ASnakePawn()
{
	PrimaryActorTick.bCanEverTick = true;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;

	static ConstructorHelpers::FObjectFinder<UStaticMesh> SphereFinder(
		TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	SphereMesh = SphereFinder.Object;

	static ConstructorHelpers::FObjectFinder<UMaterialInterface> MatFinder(
		TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	UMaterialInterface* BaseMat = MatFinder.Object;

	Head = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Head"));
	Head->SetupAttachment(Root);
	Head->SetStaticMesh(SphereMesh);
	Head->SetWorldScale3D(FVector(HeadRadius / 50.f));
	Head->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	EyeL = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("EyeL"));
	EyeR = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("EyeR"));
	for (UStaticMeshComponent* Eye : { EyeL.Get(), EyeR.Get() })
	{
		Eye->SetupAttachment(Head);
		Eye->SetStaticMesh(SphereMesh);
		Eye->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Eye->SetRelativeScale3D(FVector(0.22f));
	}
	// Head-local units: the sphere surface sits at 50, so ~50 pokes the eyes
	// halfway out of the skull.
	EyeL->SetRelativeLocation(FVector(40.f, -24.f, 18.f));
	EyeR->SetRelativeLocation(FVector(40.f, 24.f, 18.f));

	HeadLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("HeadLight"));
	HeadLight->SetupAttachment(Head);
	HeadLight->SetRelativeLocation(FVector(0.f, 0.f, 60.f));
	HeadLight->SetLightColor(FLinearColor(0.45f, 1.f, 0.85f));
	HeadLight->SetIntensity(4200.f);
	HeadLight->SetAttenuationRadius(2000.f);
	HeadLight->SetCastShadows(true);

	SpringArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("SpringArm"));
	SpringArm->SetupAttachment(Root);
	SpringArm->SetUsingAbsoluteRotation(true);
	SpringArm->SetRelativeRotation(FRotator(-56.f, 0.f, 0.f));
	SpringArm->TargetArmLength = 2900.f;
	SpringArm->bDoCollisionTest = false;
	SpringArm->bEnableCameraLag = true;
	SpringArm->CameraLagSpeed = 4.f;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(SpringArm);
	Camera->SetFieldOfView(52.f);

	// --- the Unreal look: cinematic post-processing on the game camera ---
	FPostProcessSettings& PP = Camera->PostProcessSettings;
	PP.bOverride_BloomIntensity = true;        PP.BloomIntensity = 1.15f;
	PP.bOverride_VignetteIntensity = true;     PP.VignetteIntensity = 0.55f;
	PP.bOverride_SceneFringeIntensity = true;  PP.SceneFringeIntensity = 1.4f;
	PP.bOverride_FilmGrainIntensity = true;    PP.FilmGrainIntensity = 0.25f;
	PP.bOverride_MotionBlurAmount = true;      PP.MotionBlurAmount = 0.3f;
	PP.bOverride_AutoExposureBias = true;      PP.AutoExposureBias = 0.4f;
	PP.bOverride_ColorSaturation = true;       PP.ColorSaturation = FVector4(1.12f, 1.12f, 1.12f, 1.f);
	PP.bOverride_ColorContrast = true;         PP.ColorContrast = FVector4(1.08f, 1.08f, 1.08f, 1.f);
	// Cool shadows, warm highlights — the split-tone grade.
	PP.bOverride_ColorGammaShadows = true;     PP.ColorGammaShadows = FVector4(0.96f, 1.f, 1.05f, 1.f);
	PP.bOverride_ColorGainHighlights = true;   PP.ColorGainHighlights = FVector4(1.05f, 1.01f, 0.94f, 1.f);

	if (BaseMat)
	{
		HeadMid = UMaterialInstanceDynamic::Create(BaseMat, this);
		HeadMid->SetVectorParameterValue(TEXT("Color"), FLinearColor(0.93f, 0.96f, 0.97f));
		Head->SetMaterial(0, HeadMid);
		UMaterialInstanceDynamic* EyeMid = UMaterialInstanceDynamic::Create(BaseMat, this);
		EyeMid->SetVectorParameterValue(TEXT("Color"), FLinearColor(0.05f, 0.08f, 0.1f));
		EyeL->SetMaterial(0, EyeMid);
		EyeR->SetMaterial(0, EyeMid);
	}

	SetActorLocation(FVector(0.f, 0.f, HeadRadius));
}

void ASnakePawn::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);
	PlayerInputComponent->BindAxis(TEXT("MoveForward"), this, &ASnakePawn::MoveForward);
	PlayerInputComponent->BindAxis(TEXT("MoveRight"), this, &ASnakePawn::MoveRight);
	PlayerInputComponent->BindAction(TEXT("Restart"), IE_Pressed, this, &ASnakePawn::RequestRestart);
}

void ASnakePawn::MoveForward(float Value) { InputForward = Value; }
void ASnakePawn::MoveRight(float Value) { InputRight = Value; }

void ASnakePawn::RequestRestart()
{
	if (ASnakeGameMode* GM = Cast<ASnakeGameMode>(UGameplayStatics::GetGameMode(this)))
	{
		GM->RestartRun();
	}
}

void ASnakePawn::ResetWyrm()
{
	bDead = false;
	HeadingDeg = 90.f;
	TargetLength = 8.f;
	CurrentLength = 8.f;
	Path.Reset();
	SetActorLocation(FVector(0.f, 0.f, HeadRadius));
}

void ASnakePawn::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	GameTime += DeltaSeconds;
	if (bDead) { return; }

	// --- steering: turn toward the held direction, always gliding ---
	// Screen-up is +X and screen-right is +Y under the fixed-yaw camera.
	if (FMath::Abs(InputForward) > 0.2f || FMath::Abs(InputRight) > 0.2f)
	{
		const float DesiredDeg =
			FMath::RadiansToDegrees(FMath::Atan2(InputRight, InputForward));
		HeadingDeg = FMath::FixedTurn(HeadingDeg, DesiredDeg, 250.f * DeltaSeconds);
	}
	const float Rad = FMath::DegreesToRadians(HeadingDeg);
	const FVector Dir(FMath::Cos(Rad), FMath::Sin(Rad), 0.f);
	const FVector NewPos = GetActorLocation() + Dir * Speed * DeltaSeconds;
	SetActorLocation(FVector(NewPos.X, NewPos.Y, HeadRadius));
	Head->SetWorldRotation(FRotator(0.f, HeadingDeg, 0.f));

	// --- path recording (newest first, fixed spacing) ---
	if (Path.Num() == 0 || FVector::Dist2D(Path[0], NewPos) >= PathStep)
	{
		Path.Insert(FVector(NewPos.X, NewPos.Y, HeadRadius), 0);
		const int32 MaxPoints =
			FMath::CeilToInt((TargetLength + 4.f) * SegmentSpacing / PathStep) + 8;
		if (Path.Num() > MaxPoints) { Path.SetNum(MaxPoints); }
	}

	CurrentLength = FMath::FInterpConstantTo(CurrentLength, TargetLength, DeltaSeconds, 6.f);
	SyncSegments();
	UpdateSegments();
	CheckCollisions();
}

FVector ASnakePawn::SamplePath(float Distance) const
{
	if (Path.Num() == 0) { return GetActorLocation(); }
	float Walked = 0.f;
	for (int32 i = 1; i < Path.Num(); i++)
	{
		const float Step = FVector::Dist2D(Path[i - 1], Path[i]);
		if (Walked + Step >= Distance)
		{
			const float T = Step > 0.f ? (Distance - Walked) / Step : 0.f;
			return FMath::Lerp(Path[i - 1], Path[i], T);
		}
		Walked += Step;
	}
	return Path.Last();
}

void ASnakePawn::SyncSegments()
{
	const int32 Wanted = FMath::RoundToInt(CurrentLength);
	UMaterialInterface* BaseMat = HeadMid ? HeadMid->Parent.Get() : nullptr;
	while (Segments.Num() < Wanted)
	{
		const FString Name = FString::Printf(TEXT("Seg%d"), Segments.Num());
		UStaticMeshComponent* Seg = NewObject<UStaticMeshComponent>(this, *Name);
		Seg->SetupAttachment(Root);
		Seg->SetUsingAbsoluteLocation(true);
		Seg->SetStaticMesh(SphereMesh);
		Seg->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Seg->RegisterComponent();
		UMaterialInstanceDynamic* Mid = nullptr;
		if (BaseMat)
		{
			Mid = UMaterialInstanceDynamic::Create(BaseMat, this);
			Seg->SetMaterial(0, Mid);
		}
		Segments.Add(Seg);
		SegmentMids.Add(Mid);
	}
	while (Segments.Num() > Wanted)
	{
		if (UStaticMeshComponent* Seg = Segments.Pop()) { Seg->DestroyComponent(); }
		SegmentMids.Pop();
	}
}

void ASnakePawn::UpdateSegments()
{
	const int32 Count = Segments.Num();
	for (int32 i = 0; i < Count; i++)
	{
		UStaticMeshComponent* Seg = Segments[i];
		if (!Seg) { continue; }
		const FVector P = SamplePath((i + 1) * SegmentSpacing);
		// Taper toward the tail, with a gentle breathing pulse.
		const float Taper = 1.f - 0.45f * (float(i) / FMath::Max(1, Count - 1));
		const float Breath = 1.f + 0.03f * FMath::Sin(GameTime * 2.2f - i * 0.4f);
		const float R = HeadRadius * 0.85f * Taper * Breath;
		Seg->SetWorldLocation(FVector(P.X, P.Y, R));
		Seg->SetWorldScale3D(FVector(R / 50.f));
		if (SegmentMids[i])
		{
			// Travelling shimmer down the body — subtle on the dark cloak.
			const float T = float(i) / FMath::Max(1, Count - 1);
			const float Shimmer =
				0.5f + 0.5f * FMath::Sin(GameTime * 2.2f - i * 0.45f);
			FLinearColor C = SegmentColor(T);
			C += FLinearColor(0.05f, 0.1f, 0.12f) * (0.2f * Shimmer);
			SegmentMids[i]->SetVectorParameterValue(TEXT("Color"), C);
		}
	}
}

void ASnakePawn::CheckCollisions()
{
	ASnakeGameMode* GM = Cast<ASnakeGameMode>(UGameplayStatics::GetGameMode(this));
	if (!GM || GM->bRunOver) { return; }
	const FVector2D HeadPos(GetActorLocation());

	// Arena boundary.
	if (HeadPos.Size() > GM->ArenaRadius - HeadRadius)
	{
		bDead = true;
		GM->NotifyDeath();
		return;
	}

	// Boulders.
	for (const FValeRock& Rock : GM->GetRocks())
	{
		if (FVector2D::Distance(HeadPos, Rock.Pos) < Rock.Radius * 0.92f + HeadRadius * 0.85f)
		{
			bDead = true;
			GM->NotifyDeath();
			return;
		}
	}

	// Self-collision — skip the neck.
	for (int32 i = 6; i < Segments.Num(); i++)
	{
		if (!Segments[i]) { continue; }
		if (FVector2D::Distance(HeadPos, FVector2D(Segments[i]->GetComponentLocation()))
			< HeadRadius * 1.15f)
		{
			bDead = true;
			GM->NotifyDeath();
			return;
		}
	}

	// Food.
	TArray<AActor*> Foods;
	UGameplayStatics::GetAllActorsOfClass(this, AFoodActor::StaticClass(), Foods);
	for (AActor* Actor : Foods)
	{
		if (FVector::Dist2D(Actor->GetActorLocation(), GetActorLocation())
			< HeadRadius + 55.f)
		{
			TargetLength += 2.f;
			Speed = FMath::Min(1450.f, Speed + 12.f);
			GM->ConsumeFood(Cast<AFoodActor>(Actor));
		}
	}
}
