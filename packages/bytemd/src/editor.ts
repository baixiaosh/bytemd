import type { Editor, Position } from 'codemirror';
import type { BytemdPlugin, BytemdAction, EditorProps } from './types';
import en from './locales/en.json';
import { icons } from './icons';
import selectFiles from 'select-files';

export type EditorUtils = ReturnType<typeof createEditorUtils>;

export function createEditorUtils(editor: Editor) {
  return {
    /**
     * Wrap text with decorators, for example:
     *
     * `text -> *text*`
     */
    wrapText(before: string, after = before) {
      const range = editor.somethingSelected()
        ? editor.listSelections()[0] // only handle the first selection
        : editor.findWordAt(editor.getCursor());

      const from = range.from(); // use from/to instead of anchor/head for reverse select
      const to = range.to();
      const text = editor.getRange(from, to);
      editor.replaceRange(before + text + after, from, to);

      // select the original text
      const cursor = editor.getCursor();
      editor.setSelection(
        {
          line: cursor.line,
          ch: cursor.ch - after.length - text.length,
        },
        {
          line: cursor.line,
          ch: cursor.ch - after.length,
        }
      );
    },
    /**
     * replace multiple lines
     *
     * `line -> # line`
     */
    replaceLines(replace: Parameters<Array<string>['map']>[0]) {
      const [selection] = editor.listSelections();

      const range = [
        { line: selection.from().line, ch: 0 },
        { line: selection.to().line, ch: Infinity },
      ] as const;
      const lines = editor.getRange(...range).split('\n');
      editor.replaceRange(lines.map(replace).join('\n'), ...range);
      editor.setSelection(...range);
    },
    /**
     * Append a block based on the cursor position
     */
    appendBlock(content: string): Position {
      const cursor = editor.getCursor();
      // find the first blank line

      let emptyLine = -1;
      for (let i = cursor.line; i < editor.lineCount(); i++) {
        if (!editor.getLine(i).trim()) {
          emptyLine = i;
          break;
        }
      }
      if (emptyLine === -1) {
        // insert a new line to the bottom
        editor.replaceRange('\n', { line: editor.lineCount(), ch: Infinity });
        emptyLine = editor.lineCount();
      }

      editor.replaceRange('\n' + content, {
        line: emptyLine,
        ch: Infinity,
      });
      return {
        line: emptyLine + 1,
        ch: 0,
      };
    },
    /**
     * Triggers a virtual file input and let user select files
     *
     * https://www.npmjs.com/package/select-files
     */
    selectFiles,
  };
}

export function findStartIndex(num: number, nums: number[]) {
  let startIndex = nums.length - 2;
  for (let i = 0; i < nums.length; i++) {
    if (num < nums[i]) {
      startIndex = i - 1;
      break;
    }
  }
  startIndex = Math.max(startIndex, 0); // ensure >= 0
  return startIndex;
}

const getShortcutWithPrefix = (key: string) => {
  if (typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)) {
    return 'Cmd-' + key;
  } else {
    return 'Ctrl-' + key;
  }
};

export function getBuiltinActions(
  locale: typeof en,
  plugins: BytemdPlugin[],
  uploadImages: EditorProps['uploadImages']
): BytemdAction[] {
  const items: BytemdAction[] = [
    {
      cheatsheet: `## ${locale.action.headingText}`,
      icon: icons.heading,
      children: [1, 2, 3, 4, 5, 6].map((level) => ({
        title: locale.action[`h${level}` as keyof typeof locale.action],
        icon: icons[`h${level}` as keyof typeof icons],
        handler({ replaceLines, editor }) {
          replaceLines((line) => {
            line = line.trim().replace(/^#*/, '').trim();
            line = '#'.repeat(level) + ' ' + line;
            return line;
          });
          editor.focus();
        },
      })),
    },
    {
      title: locale.action.bold,
      icon: icons.bold,
      cheatsheet: `**${locale.action.boldText}**`,
      shortcut: getShortcutWithPrefix('B'),
      handler({ wrapText, editor }) {
        wrapText('**');
        editor.focus();
      },
    },
    {
      title: locale.action.italic,
      icon: icons.italic,
      cheatsheet: `_${locale.action.italicText}_`,
      shortcut: getShortcutWithPrefix('I'),
      handler({ wrapText, editor }) {
        wrapText('_');
        editor.focus();
      },
    },
    {
      title: locale.action.quote,
      icon: icons.quote,
      cheatsheet: `> ${locale.action.quoteText}`,
      handler({ replaceLines, editor }) {
        replaceLines((line) => '> ' + line);
        editor.focus();
      },
    },
    {
      title: locale.action.link,
      icon: icons.link,
      cheatsheet: `[${locale.action.linkText}](url)`,
      shortcut: getShortcutWithPrefix('K'),
      handler({ editor, wrapText }) {
        wrapText('[', '](url)');
        const cursor = editor.getCursor();
        editor.setSelection(
          { line: cursor.line, ch: cursor.ch + 2 },
          { line: cursor.line, ch: cursor.ch + 5 }
        );
        editor.focus();
      },
    },
    {
      title: locale.action.image,
      icon: icons.image,
      cheatsheet: '![alt](url) "title"',
      handler: uploadImages
        ? async ({ appendBlock, selectFiles, editor }) => {
            const fileList = await selectFiles({
              accept: 'image/*',
              multiple: true,
            });
            const files = Array.from(fileList ?? []);
            const imgs = await uploadImages(files);
            const { line, ch } = appendBlock(
              imgs
                .map(({ url, alt, title }, i) => {
                  alt = alt ?? files[i].name;
                  return `![${alt}](${url}${title ? ` "${title}"` : ''})`;
                })
                .join('\n\n')
            );
            editor.setSelection(
              { line, ch },
              { line: line + imgs.length * 2 - 2, ch: Infinity }
            );
            editor.focus();
          }
        : undefined,
    },
    {
      title: locale.action.code,
      icon: icons.code,
      cheatsheet: '`' + locale.action.codeText + '`',
      handler({ wrapText, editor }) {
        wrapText('`');
        editor.focus();
      },
    },
    {
      title: locale.action.codeBlock,
      icon: icons.codeBlock,
      cheatsheet: '```lang',
      handler({ editor, appendBlock }) {
        const { line } = appendBlock('```js\n```');
        editor.setSelection({ line, ch: 3 }, { line, ch: 5 });
        editor.focus();
      },
    },
    {
      title: locale.action.ul,
      icon: icons.ul,
      cheatsheet: `- ${locale.action.ulText}`,
      handler({ replaceLines, editor }) {
        replaceLines((line) => '- ' + line);
        editor.focus();
      },
    },
    {
      title: locale.action.ol,
      icon: icons.ol,
      cheatsheet: `1. ${locale.action.olText}`,
      handler({ replaceLines, editor }) {
        replaceLines((line, i) => `${i + 1}. ${line}`);
        editor.focus();
      },
    },
    {
      title: locale.action.hr,
      icon: icons.hr,
      cheatsheet: '---',
    },
  ];

  plugins.forEach((p) => {
    if (Array.isArray(p.action)) {
      items.push(...p.action);
    } else if (p.action) {
      items.push(p.action);
    }
  });
  return items;
}
