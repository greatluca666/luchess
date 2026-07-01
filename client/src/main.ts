// client/src/main.ts
const createBtn = document.getElementById('create-btn') as HTMLButtonElement;
const timeSelect = document.getElementById('time-control') as HTMLSelectElement;
const colorSelect = document.getElementById('color-pref') as HTMLSelectElement;

createBtn.addEventListener('click', async () => {
  const timeControlMs = Number(timeSelect.value);
  const colorPref = colorSelect.value;
  const res = await fetch('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeControlMs, colorPref }),
  });
  const { roomId } = await res.json();
  location.href = `/game/${roomId}`;
});
