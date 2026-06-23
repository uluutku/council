export function createOpenRouterStreamParser() {
  let buffer = '';
  let terminalCount = 0;
  let finished = false;

  function parseLine(rawLine) {
    const line = rawLine.trim();
    if (!line || !line.startsWith('data:')) return { deltas: [], usage: null };
    const payload = line.slice(5).trim();
    if (terminalCount > 0) throw new Error('invalid_provider_stream');
    if (payload === '[DONE]') {
      terminalCount += 1;
      return { deltas: [], usage: null };
    }
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new Error('invalid_provider_stream');
    }
    const delta = parsed.choices?.[0]?.delta?.content;
    return {
      deltas: typeof delta === 'string' && delta.length > 0 ? [delta] : [],
      usage: parsed.usage ?? null,
    };
  }

  function consume(lines) {
    const result = { deltas: [], usage: null };
    for (const line of lines) {
      const parsed = parseLine(line);
      result.deltas.push(...parsed.deltas);
      if (parsed.usage) result.usage = parsed.usage;
    }
    return result;
  }

  return {
    push(text) {
      if (finished) throw new Error('invalid_provider_stream');
      buffer += text;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      return consume(lines);
    },
    finish(text = '') {
      if (finished) throw new Error('invalid_provider_stream');
      finished = true;
      buffer += text;
      const result = consume(buffer ? [buffer] : []);
      buffer = '';
      if (terminalCount !== 1) throw new Error('invalid_provider_stream');
      return result;
    },
  };
}
