import { describe, expect, it } from "vitest";
import { normalizeTrackName, resolveTrackMeta } from "./trackMeta";
import { addMarker, parseMarkers, removeMarker, serializeMarkers, updateMarker } from "./markers";

describe("réglages de piste portés par les clips", () => {
  it("prend le nom le plus fréquent, et le premier en cas d'égalité", () => {
    expect(resolveTrackMeta([{ name: "Voix" }, { name: "Voix" }, { name: "Musique" }]).name).toBe("Voix");
    expect(resolveTrackMeta([{ name: "Voix" }, { name: "Musique" }]).name).toBe("Voix");
    expect(resolveTrackMeta([{}, { name: "  " }]).name).toBeNull();
  });

  it("n'est verrouillée que si tous ses clips le sont", () => {
    expect(resolveTrackMeta([{ locked: true }, { locked: true }]).locked).toBe(true);
    expect(resolveTrackMeta([{ locked: true }, { locked: false }]).locked).toBe(false);
    expect(resolveTrackMeta([]).locked).toBe(false);
  });

  it("ignore une couleur inconnue", () => {
    expect(resolveTrackMeta([{ color: "teal" }]).color).toBe("teal");
    expect(resolveTrackMeta([{ color: "#ff0000" }]).color).toBeNull();
  });

  it("normalise les noms saisis", () => {
    expect(normalizeTrackName("  Voix   off  ")).toBe("Voix off");
    expect(normalizeTrackName("   ")).toBeNull();
    expect(normalizeTrackName("x".repeat(80))).toHaveLength(60);
  });
});

describe("marqueurs du projet", () => {
  it("ajoute, trie, renomme, déplace et supprime", () => {
    let markers = addMarker([], 5, "Fin");
    markers = addMarker(markers, 2.5, "Début", "teal");
    expect(markers.map((m) => [m.id, m.time])).toEqual([["m2", 2.5], ["m1", 5]]);
    markers = updateMarker(markers, "m1", { name: "Conclusion", time: 1, color: "blue" });
    expect(markers[0]).toEqual({ id: "m1", time: 1, name: "Conclusion", color: "blue" });
    markers = removeMarker(markers, "m2");
    expect(markers).toHaveLength(1);
  });

  it("ne crée pas deux marqueurs au même instant", () => {
    const markers = addMarker(addMarker([], 3, "A"), 3.0004, "B");
    expect(markers).toHaveLength(1);
  });

  it("relit ce qu'il écrit et ignore un attribut abîmé", () => {
    const markers = addMarker([], 4, "Refrain", "amber");
    expect(parseMarkers(serializeMarkers(markers))).toEqual(markers);
    expect(parseMarkers("{pas du json")).toEqual([]);
    expect(parseMarkers('[{"id":"m1","time":-2}]')).toEqual([]);
    expect(serializeMarkers([])).toBeNull();
  });
});
