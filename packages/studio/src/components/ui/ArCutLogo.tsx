/** Ar cut's supplied artwork, shared by the editor and project dashboard. */
export function ArCutLogo() {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-text-0">
      <img
        src="/ar-cut-logo.png"
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 rounded-md object-contain"
        draggable={false}
      />
      <span className="text-step-14 font-semibold">Ar cut</span>
    </span>
  );
}
