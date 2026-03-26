import React from "react";
import { Select } from "antd";
import type { SelectProps } from "antd";
import { PRIORITY_OPTIONS } from "../constants";

/**
 * Reusable priority selector.
 */
export const PrioritySelect: React.FC<SelectProps> = (props) => (
  <Select {...props} placeholder="Select Priority" options={PRIORITY_OPTIONS} />
);
