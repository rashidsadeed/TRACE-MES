import React from "react";
import { Select } from "antd";
import type { SelectProps } from "antd";
import { PRIORITY_OPTIONS, LINE_OPTIONS } from "../constants";

/**
 * Reusable priority selector.
 * Uses `options` prop (preferred in Ant Design v5) instead of children.
 */
export const PrioritySelect: React.FC<SelectProps> = (props) => (
  <Select {...props} placeholder="Select Priority" options={PRIORITY_OPTIONS} />
);

/**
 * Reusable production line selector.
 */
export const LineSelect: React.FC<SelectProps> = (props) => (
  <Select {...props} placeholder="Select Line" options={LINE_OPTIONS} />
);
