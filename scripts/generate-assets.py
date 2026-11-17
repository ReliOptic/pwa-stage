#!/usr/bin/env python3
"""Original simulator artwork, MIT. Requires Pillow; no input artwork or fonts.
Draw at 3x then reduce for crisp antialiasing. All dimensions are design estimates.
Run from the repository root: python3 scripts/generate-assets.py.
"""
from pathlib import Path
from PIL import Image, ImageDraw
OUT = Path('public/assets/ios27')
OUT.mkdir(parents=True, exist_ok=True)
def art(name, size, draw):
    scale = 3
    im = Image.new('RGBA', (size[0]*scale, size[1]*scale))
    # Coordinates are authored in target pixels; draw through a scaled canvas.
    base = Image.new('RGBA', size)
    # Drawing on the larger canvas uses explicit coordinate scaling below.
    class Pen:
        def __init__(self): self.d = ImageDraw.Draw(im)
        def box(self, xy, fill, radius=0, outline=None, width=1):
            self.d.rounded_rectangle(tuple(round(v*scale) for v in xy), radius*scale, fill=fill, outline=outline, width=width*scale)
        def line(self, xy, fill, width=1): self.d.line([(round(x*scale),round(y*scale)) for x,y in xy], fill=fill,width=width*scale)
        def arc(self, xy, start, end, fill, width): self.d.arc(tuple(v*scale for v in xy),start,end,fill=fill,width=width*scale)
        def circle(self, xy, fill): self.d.ellipse(tuple(v*scale for v in xy), fill=fill)
    draw(Pen(), *size)
    im.resize(size, Image.Resampling.LANCZOS).save(OUT/name)

def frame(p,w,h):
    r=min(w,h)*0.12
    p.box((2,2,w-3,h-3),'#555b65',r)
    p.box((5,5,w-6,h-6),'#c2c7ce',r-3)
    p.box((9,9,w-10,h-10),'#22252b',r-7)
    p.box((18,18,w-19,h-19),'#07090b',r-15)
    p.box((30,30,w-31,h-31),(0,0,0,0),r-27)
    p.line([(7,r),(7,h-r)],'#e4e7ec',2)
for name,size in {'chrome-phone11':(884,1816),'chrome-phone12':(960,1980),'chrome-phone-air':(920,1892),'chrome-phone14':(1418,1982),'chrome-phone14-wide':(1982,1418),'chrome-phone15':(1028,1424)}.items():
    art(name+'.png',size,frame)
for mode,c in [('light','#ffffff'),('dark','#111318')]:
    def cellular(p,w,h):
        for i in range(4): p.box((3+i*15,30-i*7,13+i*15,40),c,2)
    art('status-cellular-'+mode+'.png',(63,42),cellular)
    def wifi(p,w,h):
        for r in [20,13]: p.arc((25-r,31-r,25+r,31+r),220,320,c,5)
        p.circle((22,27,28,33),c)
    art('status-wifi-'+mode+'.png',(51,39),wifi)
    def battery(p,w,h):
        p.box((1,3,61,32),None,7,c,3);p.box((6,8,56,27),c,3);p.box((64,12,68,23),c,2)
    art('status-battery-'+mode+'.png',(69,36),battery)
def sensor(p,w,h):
    p.box((1,1,w-2,h-2),'#050609',30);p.box((85,25,242,32),'#242a31',3)
    p.circle((274,17,308,51),'#141f30');p.circle((282,25,300,43),'#26344b');p.circle((285,26,291,32),'#54647c')
art('notch-sensor-bar-03.png',(352,68),sensor)
def icon(p,w,h):
    p.box((0,0,w-1,h-1),'#172b3c',w*.22)
    for i in range(15): p.line([(0,h*.4+i*12),(w,h*.1+i*12)],'#1b3548',3)
    p.box((w*.22,h*.14,w*.78,h*.86),'#6de1cf',w*.09)
    p.box((w*.25,h*.17,w*.75,h*.83),'#183647',w*.065)
    p.line([(w*.5,h*.2),(w*.5,h*.8)],'#6de1cf',5)
    p.box((w*.33,h*.32,w*.45,h*.48),'#f1bc75',w*.02)
    p.box((w*.55,h*.53,w*.67,h*.69),'#90bdf2',w*.02)
art('icon-512.png',(512,512),icon)
for n in [18,36]:
    def tray(p,w,h):
        p.box((w*.15,1,w*.85,h-2),None,w*.14,'black',max(1,w//18));p.line([(w*.5,3),(w*.5,h-4)],'black',max(1,w//18))
    art('menubar-iconTemplate'+('@2x' if n==36 else '')+'.png',(n,n),tray)
def dmg(p,w,h):
    p.box((0,0,w,h),'#122938')
    for i in range(16): p.line([(0,80+i*25),(w,-100+i*25)],'#1b394a',2)
    p.box((88,78,272,260),None,32,'#5e9caa',2);p.box((388,78,572,260),None,32,'#69daca',2)
    p.line([(300,170),(360,170)],'#69daca',4);p.line([(347,157),(360,170),(347,183)],'#69daca',4)
art('dmg-background.png',(660,400),dmg)
# The installable demo uses the same original mark.
import shutil
shutil.copyfile(OUT/'icon-512.png', Path('public/reboot/icon.png'))
