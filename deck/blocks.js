// Block constructors used by the lesson files.
module.exports = {
  H: (text) => ({ t: "H", text }),
  P: (text) => ({ t: "P", text }),
  C: (text) => ({ t: "C", text }),
  D: (text) => ({ t: "D", text }),
  O: (text) => ({ t: "O", text }),
  Q: (q, a) => ({ t: "Q", q, a }),
  A: (text) => ({ t: "A", text }),   // the question a learner would ask here
  J: (text) => ({ t: "J", text }),   // where this shows up in our project
};
