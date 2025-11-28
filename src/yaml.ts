interface StackItem {
  indent: number;
  obj: any;
  isArray: boolean;
  arrayItem?: boolean;
}

export function parseYaml(text: string): any {
  const lines = text.split('\n');
  const result: any = {};
  const stack: StackItem[] = [{ indent: -2, obj: result, isArray: false }];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const commentIndex = findCommentIndex(line);
    const content = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
    const trimmed = content.trimEnd();

    if (!trimmed || trimmed.trim() === '') continue;

    const indent = trimmed.search(/\S/);
    const stripped = trimmed.trim();

    // Pop stack until we find the right parent
    // Use > for array item objects (so siblings at same indent work)
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      // Don't pop if this is continuing an array item object at same level
      if (stack[stack.length - 1].indent === indent &&
          stack[stack.length - 1].arrayItem &&
          !stripped.startsWith('-')) {
        break;
      }
      stack.pop();
    }

    const current = stack[stack.length - 1];
    const parent = current.obj;

    if (stripped.startsWith('- ')) {
      const value = stripped.slice(2).trim();

      if (!Array.isArray(parent)) {
        throw new Error(`Line ${i + 1}: Array item outside array context`);
      }

      if (value === '' || value.endsWith(':')) {
        // Array item that starts an object
        const obj: any = {};
        if (value.endsWith(':')) {
          const key = value.slice(0, -1).trim();
          obj[key] = {};
          parent.push(obj);
          stack.push({ indent: indent + 2, obj: obj[key], isArray: false, arrayItem: true });
        } else {
          parent.push(obj);
          stack.push({ indent: indent + 2, obj, isArray: false, arrayItem: true });
        }
      } else if (value.includes(': ')) {
        // Array item with key-value on same line (e.g., "- name: foo")
        const obj: any = {};
        const [key, val] = splitKeyValue(value);
        obj[key] = parseValue(val);
        parent.push(obj);
        stack.push({ indent: indent + 2, obj, isArray: false, arrayItem: true });
      } else {
        // Simple array value
        parent.push(parseValue(value));
      }
    } else if (stripped.includes(':')) {
      const colonIndex = stripped.indexOf(':');
      const key = stripped.slice(0, colonIndex).trim();
      const afterColon = stripped.slice(colonIndex + 1).trim();

      if (afterColon === '') {
        // Look ahead to determine if this is an array or object
        const nextLine = lines[i + 1];
        const nextTrimmed = nextLine ? nextLine.trim() : '';

        if (nextTrimmed.startsWith('- ')) {
          parent[key] = [];
          stack.push({ indent, obj: parent[key], isArray: true });
        } else {
          parent[key] = {};
          stack.push({ indent, obj: parent[key], isArray: false });
        }
      } else {
        parent[key] = parseValue(afterColon);
      }
    }
  }

  return result;
}

function findCommentIndex(line: string): number {
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const prevChar = line[i - 1];

    if (char === "'" && !inDoubleQuote && prevChar !== '\\') {
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && !inSingleQuote && prevChar !== '\\') {
      inDoubleQuote = !inDoubleQuote;
    } else if (char === '#' && !inSingleQuote && !inDoubleQuote) {
      return i;
    }
  }

  return -1;
}

function splitKeyValue(str: string): [string, string] {
  const colonIndex = str.indexOf(':');
  return [str.slice(0, colonIndex).trim(), str.slice(colonIndex + 1).trim()];
}

function parseValue(str: string): any {
  str = str.trim();

  if (str === 'true') return true;
  if (str === 'false') return false;
  if (str === 'null' || str === '~') return null;

  if ((str.startsWith('"') && str.endsWith('"')) ||
      (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }

  if (str.startsWith('[') && str.endsWith(']')) {
    const inner = str.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map(s => parseValue(s.trim()));
  }

  if (str.startsWith('{') && str.endsWith('}')) {
    const inner = str.slice(1, -1).trim();
    if (inner === '') return {};
    const obj: any = {};
    const pairs = inner.split(',');
    for (const pair of pairs) {
      const [key, val] = splitKeyValue(pair);
      obj[key] = parseValue(val);
    }
    return obj;
  }

  const num = Number(str);
  if (!isNaN(num) && str !== '') return num;

  return str;
}
