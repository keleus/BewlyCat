export interface Mp4SegmentInfo {
  initialization: string
  indexRange: string
  codecs: string
}

interface Box { type: string, start: number, payload: number, end: number }

/** 只解析已完整读取的 box，拒绝截断、超大长度与递归过深的输入。 */
export function parseMp4SegmentInfo(buffer: Uint8Array): Mp4SegmentInfo | null {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const readBox = (start: number, limit: number): Box | null => {
    if (start + 8 > limit)
      return null
    let size = view.getUint32(start)
    let headerSize = 8
    const type = String.fromCharCode(...buffer.subarray(start + 4, start + 8))
    if (size === 1) {
      if (start + 16 > limit)
        return null
      size = view.getUint32(start + 8) * 0x100000000 + view.getUint32(start + 12)
      headerSize = 16
    }
    // size=0 代表延伸至整个文件末尾，无法从前缀推导其真实范围。
    if (!Number.isSafeInteger(size) || size < headerSize || size > limit - start)
      return null
    return { type, start, payload: start + headerSize, end: start + size }
  }
  const findAvcCodec = (start: number, end: number, depth = 0): string | null => {
    if (depth > 8)
      return null
    for (let offset = start; offset < end;) {
      const box = readBox(offset, end)
      if (!box)
        return null
      if (box.type === 'avcC' && box.end - box.payload >= 4 && buffer[box.payload] === 1) {
        return `avc1.${Array.from(buffer.subarray(box.payload + 1, box.payload + 4))
          .map(byte => byte.toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase()}`
      }
      let children = -1
      if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(box.type))
        children = box.payload
      else if (box.type === 'stsd')
        children = box.payload + 8 // FullBox 标志与 entry_count。
      else if (box.type === 'avc1' || box.type === 'avc3')
        children = box.payload + 78 // VisualSampleEntry 固定头。
      if (children >= 0 && children < box.end) {
        const codec = findAvcCodec(children, box.end, depth + 1)
        if (codec)
          return codec
      }
      offset = box.end
    }
    return null
  }

  let moov: Box | null = null
  let sidx: Box | null = null
  for (let offset = 0; offset < buffer.length;) {
    const box = readBox(offset, buffer.length)
    if (!box)
      break
    if (box.type === 'moov')
      moov = box
    else if (box.type === 'sidx')
      sidx = box
    if (moov && sidx)
      break
    offset = box.end
  }
  if (!moov || !sidx || sidx.start < moov.end || sidx.end - sidx.payload < 24)
    return null
  const codecs = findAvcCodec(moov.payload, moov.end)
  return codecs ? { initialization: `0-${moov.end - 1}`, indexRange: `${sidx.start}-${sidx.end - 1}`, codecs } : null
}
