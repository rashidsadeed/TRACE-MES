import React from "react";
import { Form, Radio, Select, Input, Tag } from "antd";
import type { AssignmentType, LineInfo, MachineInfo } from "../types";
import { MACHINE_TYPE_COLOR } from "../constants";

interface AssignmentFieldsProps {
  assignmentType: AssignmentType | undefined;
  lines: LineInfo[];
  availableMachines: MachineInfo[];
}

const AssignmentFields: React.FC<AssignmentFieldsProps> = ({
  assignmentType,
  lines,
  availableMachines,
}) => (
  <>
    {/* Assignment Type Selection */}
    <Form.Item
      name="assignmentType"
      label="Assignment Type"
      rules={[{ required: true, message: "Select how to assign this order" }]}
    >
      <Radio.Group>
        <Radio.Button value="existing-line">Existing Line</Radio.Button>
        <Radio.Button value="machine">Select Machine(s)</Radio.Button>
        <Radio.Button value="custom-line">Create Custom Line</Radio.Button>
      </Radio.Group>
    </Form.Item>

    {/* --- Existing Line --- */}
    {assignmentType === "existing-line" && (
      <Form.Item
        name="lineId"
        label="Production Line"
        rules={[{ required: true, message: "Select a line" }]}
      >
        <Select placeholder="Select an existing line">
          {lines.map((line) => (
            <Select.Option
              key={line.id}
              value={line.id}
              disabled={line.status === "Active"}
            >
              {line.id} — {line.name}
              {line.status === "Active" && " (busy)"}
              {line.isCustom && " ★ custom"}
            </Select.Option>
          ))}
        </Select>
      </Form.Item>
    )}

    {/* --- Direct Machine Selection --- */}
    {assignmentType === "machine" && (
      <Form.Item
        name="machineIds"
        label="Select Machine(s)"
        rules={[{ required: true, message: "Select at least one machine" }]}
      >
        <Select
          mode="multiple"
          placeholder="Pick available machines"
          optionLabelProp="label"
        >
          {availableMachines.map((m) => (
            <Select.Option key={m.id} value={m.id} label={m.id}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>
                  {m.id} — {m.name}
                </span>
                <Tag
                  color={MACHINE_TYPE_COLOR[m.type]}
                  style={{ marginLeft: 8 }}
                >
                  {m.type}
                </Tag>
              </div>
            </Select.Option>
          ))}
        </Select>
      </Form.Item>
    )}

    {/* --- Custom Line --- */}
    {assignmentType === "custom-line" && (
      <>
        <Form.Item
          name="customLineName"
          label="Custom Line Name"
          rules={[{ required: true, message: "Name your custom line" }]}
        >
          <Input placeholder="e.g. Project-X Assembly" />
        </Form.Item>
        <Form.Item
          name="customMachineIds"
          label="Assign Machines to Line"
          rules={[
            { required: true, message: "Select machines for this line" },
          ]}
        >
          <Select
            mode="multiple"
            placeholder="Build your line from available machines"
            optionLabelProp="label"
          >
            {availableMachines.map((m) => (
              <Select.Option key={m.id} value={m.id} label={m.id}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>
                    {m.id} — {m.name}
                  </span>
                  <Tag
                    color={MACHINE_TYPE_COLOR[m.type]}
                    style={{ marginLeft: 8 }}
                  >
                    {m.type}
                  </Tag>
                </div>
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      </>
    )}
  </>
);

export default AssignmentFields;
