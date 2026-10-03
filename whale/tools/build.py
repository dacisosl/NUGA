"""src → dist/index.html 한 파일로 합친다.

    python tools/build.py

스크립트 순서: core.js → engine.js → ui1.js → ui2.js (모두 전역 함수, 마지막 줄 init();)
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
OUT = ROOT / "dist" / "index.html"
ORDER = ["core.js", "engine.js", "ui1.js", "ui2.js"]


def main() -> None:
    html = (SRC / "index.html").read_text(encoding="utf-8")
    css = (SRC / "style.css").read_text(encoding="utf-8")
    js = "\n".join(f"/* ---- {name} ---- */\n" + (SRC / name).read_text(encoding="utf-8") for name in ORDER)
    js += "\ninit();\n"
    if "</script" in js.lower():
        raise SystemExit("스크립트 안에 </script 가 있으면 한 파일로 합칠 수 없습니다")
    out = html.replace("/*__STYLE__*/", css).replace("/*__SCRIPT__*/", js)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(out, encoding="utf-8", newline="\n")
    print(f"dist/index.html {len(out.encode('utf-8')) / 1024:.0f}KB")


if __name__ == "__main__":
    main()
