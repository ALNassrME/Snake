#include "FoodActor.h"
#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "UObject/ConstructorHelpers.h"

AFoodActor::AFoodActor()
{
	PrimaryActorTick.bCanEverTick = true;

	static ConstructorHelpers::FObjectFinder<UStaticMesh> SphereFinder(
		TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	static ConstructorHelpers::FObjectFinder<UMaterialInterface> MatFinder(
		TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));

	Orb = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Orb"));
	Orb->SetStaticMesh(SphereFinder.Object);
	Orb->SetWorldScale3D(FVector(0.55f));
	Orb->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	RootComponent = Orb;

	if (MatFinder.Object)
	{
		Mid = UMaterialInstanceDynamic::Create(MatFinder.Object, this);
		Orb->SetMaterial(0, Mid);
	}

	Light = CreateDefaultSubobject<UPointLightComponent>(TEXT("Light"));
	Light->SetupAttachment(Orb);
	Light->SetIntensity(3200.f);
	Light->SetAttenuationRadius(1500.f);
	Light->SetCastShadows(false);
}

void AFoodActor::BeginPlay()
{
	Super::BeginPlay();
	Reroll();
}

void AFoodActor::Reroll()
{
	static const FLinearColor Palette[3] = {
		FLinearColor(1.f, 0.42f, 0.22f),  // ember
		FLinearColor(0.95f, 0.5f, 0.85f), // bloom
		FLinearColor(0.35f, 0.75f, 1.f),  // chrono
	};
	Color = Palette[FMath::RandRange(0, 2)];
	Phase = FMath::FRandRange(0.f, 6.28f);
	if (Mid) { Mid->SetVectorParameterValue(TEXT("Color"), Color * 1.4f); }
	if (Light) { Light->SetLightColor(Color); }
	BaseZ = GetActorLocation().Z;
}

void AFoodActor::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Phase += DeltaSeconds;
	const float Pulse = FMath::Sin(Phase * 3.4f);
	FVector Loc = GetActorLocation();
	Loc.Z = BaseZ + 14.f * FMath::Sin(Phase * 1.7f);
	SetActorLocation(Loc);
	AddActorWorldRotation(FRotator(0.f, 40.f * DeltaSeconds, 0.f));
	Orb->SetWorldScale3D(FVector(0.55f + 0.06f * Pulse));
	if (Light) { Light->SetIntensity(3200.f + 900.f * Pulse); }
}
