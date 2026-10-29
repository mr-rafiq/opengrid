import type { GridModel } from "./types.js";
import type { FormulaGridController } from "./formula-grid.js";
const controllers = new WeakMap<object, unknown>();
export function registerFormulaGrid<T>(
  model: GridModel<T>,
  controller: FormulaGridController<T>,
): void {
  controllers.set(model, controller);
}
/** Model identity, not duck typing, identifies a deliberately constructed formula grid. */
export function getFormulaGridController<T>(
  model: GridModel<T>,
): FormulaGridController<T> | undefined {
  return controllers.get(model) as FormulaGridController<T> | undefined;
}
