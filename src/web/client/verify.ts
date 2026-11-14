/// <reference lib="dom" />
// Client side of the rotation puzzle. Bundled by scripts/build-client.ts into
// /assets/verify.js, together with the ALTCHA widget (no external requests).
// oxlint-disable-next-line import/no-unassigned-import -- registers the <altcha-widget> element
import 'altcha';

const puzzleForm = document.querySelector<HTMLFormElement>('#puzzle');
if (puzzleForm) setUpPuzzle(puzzleForm);

function setUpPuzzle(form: HTMLFormElement): void {
	const image = form.querySelector<HTMLImageElement>('.puzzle-image img');
	const frame = form.querySelector<HTMLElement>('.puzzle-image');
	const slider = form.querySelector<HTMLInputElement>('#rotation');
	const submit = form.querySelector<HTMLButtonElement>('button[type=submit]');
	const widget = form.querySelector('altcha-widget');
	if (!image || !frame || !slider || !submit || !widget) return;

	const setRotation = (degrees: number) => {
		// Keep within the slider's range: -180..180
		const normalized = ((((Math.round(degrees) + 180) % 360) + 360) % 360) - 180;
		slider.value = String(normalized);
		image.style.rotate = `${normalized}deg`;
	};

	slider.addEventListener('input', () => setRotation(Number(slider.value)));

	// Arrow keys turn by 5°, with Shift by 15° (the range input's default step of 1° is too fine)
	slider.addEventListener('keydown', (event) => {
		const step = event.shiftKey ? 15 : 5;
		const delta = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step }[event.key];
		if (delta === undefined) return;
		event.preventDefault();
		setRotation(Number(slider.value) + delta);
	});

	// Drag the picture around its center to turn it
	let dragStart: { pointerAngle: number; rotation: number } | null = null;
	const pointerAngle = (event: PointerEvent) => {
		const box = frame.getBoundingClientRect();
		const x = event.clientX - (box.left + box.width / 2);
		const y = event.clientY - (box.top + box.height / 2);
		return (Math.atan2(y, x) * 180) / Math.PI;
	};
	frame.addEventListener('pointerdown', (event) => {
		frame.setPointerCapture(event.pointerId);
		frame.classList.add('dragging');
		dragStart = { pointerAngle: pointerAngle(event), rotation: Number(slider.value) };
	});
	frame.addEventListener('pointermove', (event) => {
		if (dragStart) setRotation(dragStart.rotation + pointerAngle(event) - dragStart.pointerAngle);
	});
	const endDrag = () => {
		dragStart = null;
		frame.classList.remove('dragging');
	};
	frame.addEventListener('pointerup', endDrag);
	frame.addEventListener('pointercancel', endDrag);

	// The answer only counts once the background proof-of-work is done
	widget.addEventListener('statechange', (event) => {
		const detail: unknown = event instanceof CustomEvent ? event.detail : null;
		const state = typeof detail === 'object' && detail !== null && 'state' in detail ? detail.state : null;
		submit.disabled = state !== 'verified';
		submit.textContent = state === 'verified' ? "That's upright" : 'Checking your browser…';
	});
	submit.textContent = 'Checking your browser…';
}
