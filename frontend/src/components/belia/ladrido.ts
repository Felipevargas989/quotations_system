// EL LADRIDO DE BELIA (doc 20 §8b): dos «guau» cortos hechos con el audio
// del navegador, sin archivo de sonido. Es el de la demo de GPT del 03-11.
// Suena solo si la persona lo activó en la ventanilla; si el navegador no
// deja sonar (sin un clic antes, por ejemplo), no pasa nada.

type ConAudioViejo = typeof window & {
  webkitAudioContext?: typeof AudioContext;
};

export const ladrar = (): void => {
  try {
    const Contexto =
      window.AudioContext || (window as ConAudioViejo).webkitAudioContext;
    if (!Contexto) return;
    const ctx = new Contexto();
    for (const [a, hz] of [
      [0, 210],
      [0.16, 170],
    ]) {
      const tono = ctx.createOscillator();
      const volumen = ctx.createGain();
      const cuando = ctx.currentTime + a;
      tono.type = "sawtooth";
      tono.frequency.setValueAtTime(hz, cuando);
      tono.frequency.exponentialRampToValueAtTime(80, cuando + 0.12);
      volumen.gain.setValueAtTime(0.0001, cuando);
      volumen.gain.exponentialRampToValueAtTime(0.08, cuando + 0.017);
      volumen.gain.exponentialRampToValueAtTime(0.0001, cuando + 0.14);
      tono.connect(volumen);
      volumen.connect(ctx.destination);
      tono.start(cuando);
      tono.stop(cuando + 0.15);
    }
    setTimeout(() => void ctx.close(), 500);
  } catch {
    // Sin audio, BelIA avisa igual con la burbuja.
  }
};
