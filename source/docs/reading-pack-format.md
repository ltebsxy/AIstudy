# 读写阅读包格式（version 1）

在应用“读写模式 → 导入文件夹”中选择阅读包根目录。文件会复制到应用数据目录；保留目录层级，导入不修改原文件。课程模式的文件夹保持独立。

## 普通文件夹

没有清单时，递归导入 PDF、TXT、MD、Markdown、PNG、JPG、JPEG、WebP、GIF、BMP；忽略其他文件、隐藏目录和符号链接，不创建空目录。导入前检查全部文件；失败时不保留半份阅读包。

## 带清单的阅读包

推荐根目录放 `reading-pack.json`，UTF-8 JSON。存在清单时，只导入 `documents` 列出的文件；学习指南、答案、词表、统计、来源说明等可放 `materials/`，不会混入阅读列表。

```json
{
  "version": 1,
  "title": "AI 主题高中 3500 词阅读",
  "readingMode": "english",
  "documents": [
    {"file": "articles/01-a-learning-partner.txt", "name": "01 · A Learning Partner"},
    {"file": "articles/02-a-coding-assistant.txt", "name": "02 · A Coding Assistant"}
  ]
}
```

- `version` 必须是数字 `1`。
- `title` 可选，1–80 字；未填写时使用所选文件夹名。
- `readingMode` 可选，`standard` 或 `english`，默认 `standard`。仅决定每个文件首次打开的模式；用户修改并保存后，以其选择为准。
- `documents` 为非空数组，最多 500 个文件；每项 `{file, name?}`，不重复。
- `file` 使用相对于包根目录的路径，推荐 `/` 分隔；只接受上述阅读格式，不能包含绝对路径、盘符、`..`、隐藏路径或符号链接。
- `name` 可选，1–200 字；未填则显示文件名。
- 每个 TXT/Markdown 最大 5 MB，图片最大 30 MB，PDF 最大 100 MB；整个包最大 500 MB。文件不可为空。
- 清单文件最大 1 MB；清单只保存上述数据，不执行脚本、不打开外部链接。

## 建议的英语材料布局

```text
ai-3500-reading/
  reading-pack.json
  articles/
    01-example.txt
    02-example.txt
  materials/
    target-vocabulary.csv
    vocabulary-coverage.csv
    study-guide.md
    answers.md
    sources.md
    README.md
  complete-reading.txt
```

文章建议为 UTF-8 纯英文 TXT（标题、空行、短段落）；中文词汇说明、练习与答案分别保存。`complete-reading.txt` 可供单文件连续阅读；清单列出分篇文件即可，避免重复导入。清单顺序建议与两位数字文件名前缀一致。
