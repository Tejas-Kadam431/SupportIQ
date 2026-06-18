type ChunkTextOptions = {
  chunkSize?: number;
  overlap?: number;
};

export type TextChunk = {
  chunkIndex: number;
  content: string;
  tokenCount: number;
};

const DEFAULT_CHUNK_SIZE = 1200;
const DEFAULT_OVERLAP = 200;

export function chunkText(text: string, options: ChunkTextOptions = {}): TextChunk[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap ?? DEFAULT_OVERLAP;

  if (!text.trim()) {
    return [];
  }

  if (chunkSize <= overlap) {
    throw new Error("chunkSize must be greater than overlap");
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < text.length) {
    const rawEnd = Math.min(start + chunkSize, text.length);
    const end = findNaturalBreak(text, start, rawEnd);

    const content = text.slice(start, end).trim();

    if (content) {
      chunks.push({
        chunkIndex,
        content,
        tokenCount: estimateTokenCount(content)
      });

      chunkIndex += 1;
    }

    if (end >= text.length) {
      break;
    }

    start = Math.max(end - overlap, 0);
  }

  return chunks;
}

function estimateTokenCount(text: string) {
  return Math.ceil(text.length / 4);
}

function findNaturalBreak(text: string, start: number, rawEnd: number) {
  if (rawEnd >= text.length) {
    return text.length;
  }

  const slice = text.slice(start, rawEnd);

  const paragraphBreak = slice.lastIndexOf("\n\n");
  if (paragraphBreak > 400) {
    return start + paragraphBreak;
  }

  const sentenceBreak = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf("! ")
  );

  if (sentenceBreak > 400) {
    return start + sentenceBreak + 1;
  }

  const spaceBreak = slice.lastIndexOf(" ");

  if (spaceBreak > 400) {
    return start + spaceBreak;
  }

  return rawEnd;
}