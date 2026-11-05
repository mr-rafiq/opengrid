import { expect, it, vi } from "vitest";
import { createAg31ViewServices } from "./ag31-view-services.js";
import { createAg31ClientController } from "./ag31-client-controller.js";
it("uses the actual active mounted port, with stable parameters and no stored fallback position", () => {
  const services = createAg31ViewServices(),
    scrollTo = vi.fn(() => true);
  let active = false;
  expect(services.ctrlsService.params).toBeUndefined();
  const detach = services.attach(() => ({ isActive: () => active, scrollTo }));
  expect(services.ctrlsService.params).toBeUndefined();
  active = true;
  const params = services.ctrlsService.params!;
  expect(services.ctrlsService.params).toBe(params);
  params.gridBodyCtrl.bodyScrollFeature.setScrollPosition(800, 250);
  expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 800, left: 250 });
  active = false;
  expect(services.ctrlsService.params).toBeUndefined();
  params.gridBodyCtrl.bodyScrollFeature.setScrollPosition(100, 50);
  expect(scrollTo).toHaveBeenCalledTimes(1);
  active = true;
  detach();
  expect(services.ctrlsService.params).toBeUndefined();
});
it("keeps a replacement attachment active when an older view cleans up and revokes captured services on destroy", () => {
  const services = createAg31ViewServices(),
    old = vi.fn(() => true),
    current = vi.fn(() => true);
  const detachOld = services.attach(() => ({
    isActive: () => true,
    scrollTo: old,
  }));
  const params = services.ctrlsService.params!;
  services.attach(() => ({ isActive: () => true, scrollTo: current }));
  detachOld();
  params.gridBodyCtrl.bodyScrollFeature.setScrollPosition(300, 100);
  expect(old).not.toHaveBeenCalled();
  expect(current).toHaveBeenCalledExactlyOnceWith({ top: 300, left: 100 });
  services.destroy();
  expect(services.ctrlsService.params).toBeUndefined();
  params.gridBodyCtrl.bodyScrollFeature.setScrollPosition(50, 20);
  services.attach(() => ({ isActive: () => true, scrollTo: old }));
  expect(current).toHaveBeenCalledTimes(1);
  expect(services.ctrlsService.params).toBeUndefined();
});
it("rejects malformed live offsets and reports a mounted port that cannot apply the command", () => {
  const services = createAg31ViewServices(),
    scrollTo = vi.fn(() => false);
  services.attach(() => ({ isActive: () => true, scrollTo }));
  const scroll = services.ctrlsService.params!.gridBodyCtrl.bodyScrollFeature;
  for (const [top, left] of [
    [NaN, 0],
    [0, Infinity],
    [-1, 0],
    [0, -1],
  ])
    expect(() => scroll.setScrollPosition(top, left)).toThrow(
      /finite nonnegative/,
    );
  expect(scrollTo).not.toHaveBeenCalled();
  expect(() => scroll.setScrollPosition(0, 0)).toThrow(/could not restore/);
  services.destroy();
});
it("owns one narrow source service for the controller's actual lifetime", () => {
  const owner = createAg31ClientController({
    rows: [{ id: "a" }],
    definitions: [{ field: "id" }],
    getRowId: (r) => r.id,
  });
  const service = owner.api.ctrlsService;
  expect(service.params).toBeUndefined();
  const scrollTo = vi.fn(() => true);
  owner.viewServices.attach(() => ({ isActive: () => true, scrollTo }));
  const params = service.params!;
  owner.api.destroy();
  expect(service.params).toBeUndefined();
  params.gridBodyCtrl.bodyScrollFeature.setScrollPosition(100, 200);
  expect(scrollTo).not.toHaveBeenCalled();
});

it("preserves fractional stored offsets until the browser applies its own pixel rounding", () => {
  const services = createAg31ViewServices(),
    scrollTo = vi.fn(() => true);
  services.attach(() => ({ isActive: () => true, scrollTo }));
  services.ctrlsService.params!.gridBodyCtrl.bodyScrollFeature.setScrollPosition(
    141.25,
    70.66666412353516,
  );
  expect(scrollTo).toHaveBeenCalledExactlyOnceWith({
    top: 141.25,
    left: 70.66666412353516,
  });
  services.destroy();
});
