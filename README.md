# Canvas PDF Viewcard

Obsidian Canvas의 모든 PDF 카드를 읽기 편한 보기로 바꿉니다.

- 카드 크기에 맞춘 페이지 전체 / 너비 맞춤
- 한 페이지 / 연속 / 두 페이지 / 두 페이지 연속
- PDF 본문 더블클릭으로 큰 미리보기 팝업 열기
- 팝업에서 다른 페이지를 읽어도 카드의 페이지 유지
- 카드별 페이지와 보기 설정 저장
- 밝은 테마와 어두운 테마 지원

Windows 데스크톱 Obsidian용입니다. 별도의 Acrobat 설치나 유료 서비스가 필요하지 않습니다.

![Canvas PDF 카드](docs/images/card.png)

카드 크기에 맞춰 페이지 전체를 표시합니다.

![큰 PDF 미리보기](docs/images/popup.png)

더블클릭한 팝업에서 보기 방식을 선택합니다. 팝업의 페이지 이동은 카드에 반영하지 않습니다.

## 설치

BRAT에서 **Add beta plugin**을 선택하고 다음 저장소 주소를 입력합니다.

`https://github.com/tlatndms2-droid/obsidian-canvas-pdf-viewcard`

설치 후 커뮤니티 플러그인에서 **Canvas PDF Viewcard**를 켜면 기존·신규 Canvas PDF 카드에 자동 적용됩니다.

수동 설치는 [Releases](https://github.com/tlatndms2-droid/obsidian-canvas-pdf-viewcard/releases)의 `main.js`, `manifest.json`, `styles.css`를 보관함의 `.obsidian/plugins/canvas-pdf-viewcard/`에 넣은 뒤 활성화합니다.

## 사용

1. Canvas에 PDF를 놓습니다. 기본은 한 페이지 전체 맞춤입니다.
2. 카드 아래의 숫자 또는 화살표로 표시할 페이지를 선택합니다.
3. **보기** 메뉴에서 페이지 배치와 크기 맞춤을 바꿉니다.
4. PDF 본문을 **더블클릭**하거나 오른쪽 아래 **크게 보기** 버튼을 누릅니다.
5. 큰 팝업에서 페이지 배치, 크기 맞춤, 확대·축소를 사용합니다. `Esc` 또는 `✕`로 닫습니다.

예를 들어 카드가 3페이지라면, 팝업에서 10페이지까지 읽고 닫아도 카드는 3페이지를 유지합니다. 팝업을 다시 열면 카드의 3페이지에서 시작하며 팝업의 보기 방식은 기억합니다.

카드를 선택한 뒤 PDF 위에서 휠을 움직이면 문서를 스크롤합니다. Canvas의 빈 공간에서는 기존 Canvas 이동·확대 동작을 사용합니다. 카드 이동은 파일명 영역을 드래그하고 크기는 모서리에서 조절합니다.

PDF 본문을 클릭하면 카드를 선택하며, 방향키와 드래그로 카드를 이동할 수 있습니다. 다시 클릭해도 선택 상태를 유지합니다. **Enter**를 누르면 **읽기 중 · Enter 복귀 · Ctrl+Enter 미리보기** 표시와 강조 테두리가 나타납니다.

읽는 동안 `←`·`→` 또는 `Page Up`·`Page Down`은 페이지를 넘기고, `↑`·`↓`는 PDF를 스크롤합니다. 카드 위치는 움직이지 않습니다. 아래쪽 도구 모음이나 페이지 번호 칸을 사용해도 읽기로 진입합니다. **Enter를 다시 누르면 카드 선택으로 복귀**합니다. `Esc`, 파일명 클릭, Canvas 빈 공간 클릭으로도 읽기를 끝낼 수 있습니다. 페이지 번호 입력칸에서는 Enter로 입력한 번호를 확정합니다.

카드 선택 또는 읽기 중 **Ctrl+Enter**를 누르면 큰 미리보기가 열립니다. 팝업에서 **Enter 또는 Esc**를 누르면 카드 선택으로 돌아갑니다. 팝업에서 읽은 위치는 카드에 반영되지 않습니다. 기존 더블클릭과 크게 보기 버튼도 사용할 수 있습니다.

## 저장과 호환성

- PDF 원본과 `.canvas` 파일의 형식을 변경하지 않습니다.
- 보기 설정은 플러그인의 `data.json`에 저장됩니다. 같은 PDF를 여러 카드에 넣어도 페이지와 보기 설정은 각각 유지됩니다.
- 기존 `#page=3` 같은 카드 페이지 지정을 초기값으로 사용합니다.
- 일반 PDF 탭은 Obsidian 기본 뷰어를 사용합니다.
- 플러그인을 끄면 Canvas 카드도 Obsidian 기본 뷰어로 돌아갑니다.
- Canvas 내부 표시 연결 부분은 Obsidian의 비공개 기능에 의존합니다. Obsidian 업데이트 후에는 실제 동작 확인이 필요합니다.
- 현재 버전은 읽기 전용 페이지 표시입니다. PDF 본문 편집, 주석 작성, OCR, 본문 검색 및 텍스트 선택은 제공하지 않습니다.

## 개발

Node.js 22 이상에서 의존성을 설치한 뒤:

```sh
npm install
npm run build
npm test
```

빌드에는 TypeScript와 esbuild를 사용합니다. PDF 처리는 Obsidian이 제공하는 PDF.js를 사용하므로 PDF.js 또는 worker를 별도로 내려받지 않습니다.

`scripts/`의 검증 도구는 격리된 `CanvasPdfViewcard-Sandbox` 창만 대상으로 합니다. `CDP_PORT`로 포트를 지정할 수 있으며 Playwright와 pdf-lib는 검증 환경에서 별도로 제공해야 합니다. 개인 보관함에서는 실행하지 마세요.

## 라이선스

MIT
