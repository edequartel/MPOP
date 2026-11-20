import MarkdownIt from "./vendor/markdown-it/markdown-it-15.0.3.min.js";

const markdown = new MarkdownIt({ html: false, breaks: true });

export function addLessonMarkdownField(cell, input) {
  const field = document.createElement("div");
  field.className = "lesson-markdown-field";
  const preview = document.createElement("div");
  preview.className = "lesson-markdown-preview";
  field.append(input, preview);
  cell.append(field);

  const render = () => {
    preview.innerHTML = markdown.render(input.value);
  };
  input.addEventListener("blur", render);

  return (value, readonly) => {
    input.value = value ?? "";
    input.readOnly = readonly;
    // The textarea handles focus and editing. Read-only users can browse the rendered content.
    preview.inert = !readonly;
    render();
  };
}
