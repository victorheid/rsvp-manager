// Public API of the groups domain. Other domains import only from here,
// never from groups/actions/*, groups/getters/*, or groups/rules directly.
export { groupsRouter } from "./router";
export { createGroup } from "./actions/createGroup";
export { getGroupBySlug } from "./getters/getGroupBySlug";
