from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
output = root / 'assets' / 'icon.ico'
output.parent.mkdir(exist_ok=True)

image = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((11, 11, 245, 245), radius=57, fill=(31, 91, 85, 255))
font_path = Path('C:/Windows/Fonts/msyhbd.ttc')
if not font_path.exists():
    font_path = Path('C:/Windows/Fonts/msyh.ttc')
font = ImageFont.truetype(str(font_path), 144)
draw.text((128, 122), '知', anchor='mm', font=font, fill=(255, 255, 255, 255))
image.save(output, format='ICO', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(output)
