// Allow direct year entry and format pasted or typed digits without a calendar.
export function formatBirthDate(value) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.slice(0, 4) + (digits.length > 4 ? '-' + digits.slice(4, 6) : '') + (digits.length > 6 ? '-' + digits.slice(6) : '');
}
document.addEventListener('input', event => {
  const field = event.target;
  if (!field.matches('input[name="birthDate"][type="text"]') || event.inputType?.startsWith('delete')) return;
  const position = field.selectionStart;
  const digitsBefore = field.value.slice(0, position).replace(/\D/g, '').length;
  field.value = formatBirthDate(field.value);
  const caret = Math.min(field.value.length, digitsBefore + (digitsBefore > 4 ? 1 : 0) + (digitsBefore > 6 ? 1 : 0));
  field.setSelectionRange(caret, caret);
});
