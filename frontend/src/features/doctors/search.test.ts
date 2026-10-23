import { describe, expect, it } from "vitest";
import { doctors } from "../../data/doctors";
import { searchDoctors } from "./search";
import type { SearchFilters } from "./model";

const base: SearchFilters = {
  query: "",
  city: "",
  specialty: "",
  sort: "name",
};
describe("doctor discovery", () => {
  it("combines specialty, city, and inclusive maximum fee", () => {
    expect(
      searchDoctors(doctors, {
        ...base,
        city: "Rourkela",
        specialty: "dental",
        maxFee: 400,
      }).map((d) => d.id),
    ).toEqual(["rohan"]);
    expect(
      searchDoctors(doctors, {
        ...base,
        city: "Rourkela",
        specialty: "dental",
        maxFee: 399,
      }),
    ).toEqual([]);
  });
  it("finds doctors, clinics, and areas with case-insensitive token matching", () => {
    expect(
      searchDoctors(doctors, { ...base, query: "  SEN   Willow " }).map(
        (d) => d.id,
      ),
    ).toEqual(["ananya"]);
    expect(
      searchDoctors(doctors, { ...base, query: "Whitefield" }).map((d) => d.id),
    ).toEqual(["ishita"]);
    expect(searchDoctors(doctors, { ...base, query: "Dentist" })).toHaveLength(
      2,
    );
  });
  it("sorts fees numerically without mutating the source", () => {
    const original = doctors.map((d) => d.id);
    const found = searchDoctors(doctors, { ...base, sort: "fee" });
    expect(found[0].id).toBe("rohan");
    expect(found.at(-1)?.id).toBe("mira");
    expect(doctors.map((d) => d.id)).toEqual(original);
  });
  it("sorts experience descending and returns an empty result for unknown locations", () => {
    expect(searchDoctors(doctors, { ...base, sort: "experience" })[0].id).toBe(
      "mira",
    );
    expect(searchDoctors(doctors, { ...base, city: "Unknown" })).toEqual([]);
  });
  it("keeps literal input literal rather than treating it as a regular expression", () => {
    expect(searchDoctors(doctors, { ...base, query: ".*" })).toEqual([]);
  });
});
