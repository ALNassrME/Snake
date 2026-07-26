#include "ValeProp.h"
#include "Components/StaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "Engine/StaticMesh.h"

AValeProp::AValeProp()
{
	PrimaryActorTick.bCanEverTick = false;
	MeshComp = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	MeshComp->SetMobility(EComponentMobility::Movable);
	MeshComp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	RootComponent = MeshComp;
}

void AValeProp::Init(UStaticMesh* Mesh, const FLinearColor& Color, const FVector& Scale)
{
	if (Mesh)
	{
		MeshComp->SetStaticMesh(Mesh);
	}
	MeshComp->SetWorldScale3D(Scale);
	if (UMaterialInterface* Base = LoadObject<UMaterialInterface>(
			nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial")))
	{
		Mid = UMaterialInstanceDynamic::Create(Base, this);
		Mid->SetVectorParameterValue(TEXT("Color"), Color);
		MeshComp->SetMaterial(0, Mid);
	}
}

void AValeProp::AddGlow(const FLinearColor& Color, float Intensity, float Radius, float ZOffset)
{
	Glow = NewObject<UPointLightComponent>(this, TEXT("Glow"));
	Glow->SetupAttachment(RootComponent);
	Glow->SetRelativeLocation(FVector(0.f, 0.f, ZOffset));
	Glow->SetLightColor(Color);
	Glow->SetIntensity(Intensity);
	Glow->SetAttenuationRadius(Radius);
	Glow->SetCastShadows(false);
	Glow->RegisterComponent();
}
