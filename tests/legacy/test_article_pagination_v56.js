// V5.6.2: the old test assumed narration was cut at screen-page boundaries.
// Narration now uses whole source paragraphs and anchors each FULL sentence
// back to its visible screen fragment. Reuse the stronger cross-page regression.
require('./test_reader_narration_v562.js');
