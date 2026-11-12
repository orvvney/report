# Иконка комнат

[rooms.png](../images/rooms.png) используется справа от `Սենյակներ` в нижней
гистограмме. Иконка создана встроенным инструментом `image_gen` с прозрачным
фоном; стилевыми образцами служили [building.png](../images/building.png) и
[wallet.png](../images/wallet.png). В интерфейсе все три изображения отображаются
в размере 40×40 px с одинаковой CSS-обработкой: `brightness(0)` и `opacity: .55`.

Исходный запрос для воспроизведения стиля:

```text
Use case: stylized-concept. Asset type: small website UI icon. Generate a rooms / apartment floor plan icon matching the two supplied reference icons (building and wallet), which are style references only. One simple rounded square apartment floor plan divided into three rooms with doorway gaps, thick rounded white porcelain outline strokes, faint cool grey edge bevel, subtle soft 3D relief, front-facing flat view. Match their understated white monochrome material, stroke thickness, centered composition and generous transparent padding (symbol occupies approximately 48% of square canvas width). No text, letters, numbers, colored accents or additional objects. Genuine transparent background. Keep internal room spaces transparent, readable at small sizes.
```

Описание поведения графика — в [отчёте по сделкам](report.md#гистограмма).
