// Standalone ESM entry built by tsup and loaded through `~/utils/streamPlayers`,
// so hls.js stays out of the content script until a stream preview needs it.
export { default as Hls } from 'hls.js'
