#include "SnakeHUD.h"
#include "SnakeGameMode.h"
#include "CanvasItem.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Kismet/GameplayStatics.h"

void ASnakeHUD::DrawHUD()
{
	Super::DrawHUD();
	ASnakeGameMode* GM = Cast<ASnakeGameMode>(UGameplayStatics::GetGameMode(this));
	if (!GM || !Canvas) { return; }

	UFont* Font = GEngine ? GEngine->GetLargeFont() : nullptr;
	if (!Font) { return; }

	const FLinearColor Parchment(0.93f, 0.9f, 0.82f, 0.95f);
	const FLinearColor Dim(0.93f, 0.9f, 0.82f, 0.45f);

	FCanvasTextItem Score(FVector2D(46.f, 40.f),
		FText::FromString(FString::FromInt(GM->Score)), Font, Parchment);
	Score.Scale = FVector2D(3.2f, 3.2f);
	Score.EnableShadow(FLinearColor::Black);
	Canvas->DrawItem(Score);

	FCanvasTextItem Best(FVector2D(48.f, 96.f),
		FText::FromString(FString::Printf(TEXT("BEST %d"), GM->BestScore)), Font, Dim);
	Best.Scale = FVector2D(1.2f, 1.2f);
	Best.EnableShadow(FLinearColor::Black);
	Canvas->DrawItem(Best);

	if (GM->bRunOver)
	{
		const FString Msg = TEXT("THE VALE RECLAIMS YOU");
		FCanvasTextItem Death(
			FVector2D(Canvas->SizeX * 0.5f - 220.f, Canvas->SizeY * 0.42f),
			FText::FromString(Msg), Font, Parchment);
		Death.Scale = FVector2D(2.2f, 2.2f);
		Death.EnableShadow(FLinearColor::Black);
		Canvas->DrawItem(Death);
	}
}
