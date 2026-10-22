const assert=require('node:assert/strict');
const {splitSentences,forNarration}=require('../app/src/main/assets/reader-sentences.js');
function check(source,expected){
 const parsed=splitSentences(source).map(x=>x.text);
 assert.deepEqual(parsed,expected,source);
 assert.equal(parsed.join(' ').replace(/\s+/g,' '),source.trim().replace(/\s+/g,' '));
}
check('Mr. Darcy looked up. He walked away.',['Mr. Darcy looked up.','He walked away.']);
check('Dr. Watson went to St. James. It was raining.',['Dr. Watson went to St. James.','It was raining.']);
check('The U.S. flag moved. The wind came.',['The U.S. flag moved.','The wind came.']);
check('The number was 3.14. Then it changed.',['The number was 3.14.','Then it changed.']);
check('I met J. R. R. Tolkien. He spoke.',['I met J. R. R. Tolkien.','He spoke.']);
check('“What?” she asked. “Nothing!”',['“What?” she asked.','“Nothing!”']);
check('“No!” cried Anne. He laughed.',['“No!” cried Anne.','He laughed.']);
check('He said, “Really?!” Then he left.',['He said, “Really?!”','Then he left.']);
check('We have e.g. five examples. That is enough.',['We have e.g. five examples.','That is enough.']);
check('The boy thought... then smiled. “Yes.”',['The boy thought...','then smiled.','“Yes.”']);
check('He was very tired, but he kept walking.',['He was very tired, but he kept walking.']);
for(const example of [
 'As the gentleman went round the room, saying not a word and looking at everybody, the children began to run toward the door; but before they had got there, he stopped them.',
 '“It was a very curious thing,” said Alice, “and I do not know whether it was a dream.”',
 'I should think Mr. Bingley must have been very much surprised, when he saw how quickly the two girls approached.'
]){const units=forNarration(example,420);assert(units.every(x=>x.text.length<=420));assert.equal(units.map(x=>x.text).join(' ').replace(/\s+/g,' '),example.replace(/\s+/g,' '));}
const long='This is a clause, '.repeat(40)+'and this is the end.';
const pieces=forNarration(long,420);
assert(pieces.length>1&&pieces.every(p=>p.text.length<=420));
assert.equal(pieces.map(x=>x.text).join(' ').replace(/\s+/g,' '),long.replace(/\s+/g,' '));
console.log('PASS V5.6.2 English sentence punctuation, dialogue, abbreviations, decimals, lossless long-clause split');
