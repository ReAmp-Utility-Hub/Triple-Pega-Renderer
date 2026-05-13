import { useState, useCallback } from "react";

import { getMaskPlaceholder, applyMask } from "./DynamicFieldUtils";

/**
 * Single Field Component
 */
export const DynamicField = ({ field, value, onChange, onBlur, error }) => {
  const [touched, setTouched] = useState(false);

  const handleChange = useCallback(
    (e) => {
      let newValue = e.target.value;

      // Apply mask if present
      if (field.mask) {
        newValue = applyMask(newValue, field.mask);
      }

      // Convert numeric values
      if (field.isNumeric && newValue !== "") {
        newValue = newValue === "" ? "" : Number(newValue);
      }

      onChange(field.name, newValue);
    },
    [field, onChange],
  );

  const handleBlur = useCallback(() => {
    setTouched(true);
    if (onBlur) onBlur(field.name);
  }, [field.name, onBlur]);

  const handleCheckboxChange = useCallback(
    (e) => {
      onChange(field.name, e.target.checked);
    },
    [field, onChange],
  );

  let displayValue = value ?? "";

  if (displayValue && typeof displayValue === "string") {
    if (field.inputType === "date" && displayValue.includes("T")) {
      displayValue = displayValue.split("T")[0];
    } else if (
      field.inputType === "datetime-local" &&
      displayValue.includes("T")
    ) {
      displayValue = displayValue.substring(0, 16);
    }
  }

  const showError = error && (touched || error);

  // Render based on field category
  switch (field.category) {
    case "select":
      return (
        <div className="form-group" key={field.name}>
          <label>
            {field.label}
            {field.required && <span className="required-star">*</span>}
          </label>
          <select
            name={field.name}
            value={displayValue}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={field.readOnly}
            required={field.required}
          >
            <option value="">
              {field.placeholder || `Select ${field.label}...`}
            </option>
            {field.options.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.value}
              </option>
            ))}
          </select>
          {field.helperText && (
            <small className="field-helper-text">{field.helperText}</small>
          )}
          {showError && <div className="error-message">{error}</div>}
        </div>
      );

    case "textarea":
      return (
        <div className="form-group" key={field.name}>
          <label>
            {field.label}
            {field.required && <span className="required-star">*</span>}
          </label>
          <textarea
            name={field.name}
            value={displayValue}
            onChange={handleChange}
            onBlur={handleBlur}
            readOnly={field.readOnly}
            placeholder={field.placeholder || field.label}
            maxLength={field.maxLength}
            required={field.required}
            rows={3}
          />
          {field.helperText && (
            <small className="field-helper-text">{field.helperText}</small>
          )}
          {showError && <div className="error-message">{error}</div>}
        </div>
      );

    case "checkbox":
      return (
        <div className="form-group checkbox-group" key={field.name}>
          <label className="checkbox-label">
            <input
              type="checkbox"
              name={field.name}
              checked={!!displayValue}
              onChange={handleCheckboxChange}
              onBlur={handleBlur}
              disabled={field.readOnly}
            />
            {field.label}
            {field.required && <span className="required-star">*</span>}
          </label>
          {field.helperText && (
            <small className="field-helper-text">{field.helperText}</small>
          )}
          {showError && <div className="error-message">{error}</div>}
        </div>
      );

    case "masked":
      return (
        <div className="form-group" key={field.name}>
          <label>
            {field.label}
            {field.required && <span className="required-star">*</span>}
          </label>
          <input
            type="text"
            name={field.name}
            value={displayValue}
            onChange={handleChange}
            onBlur={handleBlur}
            readOnly={field.readOnly}
            placeholder={
              field.mask ? getMaskPlaceholder(field.mask) : field.placeholder
            }
            maxLength={field.mask ? field.mask.length : field.maxLength}
            required={field.required}
            className={field.readOnly ? "read-only-input" : ""}
          />
          {field.helperText && (
            <small className="field-helper-text">{field.helperText}</small>
          )}
          {showError && <div className="error-message">{error}</div>}
        </div>
      );

    case "autocomplete":
      return (
        <div className="form-group" key={field.name}>
          <label>
            {field.label}
            {field.required && <span className="required-star">*</span>}
          </label>
          <input
            type="text"
            name={field.name}
            value={displayValue}
            onChange={handleChange}
            onBlur={handleBlur}
            readOnly={field.readOnly}
            placeholder={field.placeholder || `Enter ${field.label}`}
            maxLength={field.maxLength}
            required={field.required}
            list={`${field.name}-options`}
            className={field.readOnly ? "read-only-input" : ""}
          />
          <datalist id={`${field.name}-options`}>
            {field.options.map((opt) => (
              <option key={opt.key} value={opt.value} />
            ))}
          </datalist>
          {field.helperText && (
            <small className="field-helper-text">{field.helperText}</small>
          )}
          {showError && <div className="error-message">{error}</div>}
        </div>
      );

    default:
      // Standard input field
      return (
        <div className="form-group" key={field.name}>
          <label>
            {field.label}
            {field.required && <span className="required-star">*</span>}
          </label>
          <input
            type={field.inputType}
            name={field.name}
            value={displayValue}
            onChange={handleChange}
            onBlur={handleBlur}
            readOnly={field.readOnly}
            placeholder={field.placeholder || field.label}
            maxLength={field.maxLength}
            required={field.required}
            className={field.readOnly ? "read-only-input" : ""}
          />
          {field.helperText && (
            <small className="field-helper-text">{field.helperText}</small>
          )}
          {showError && <div className="error-message">{error}</div>}
        </div>
      );
  }
};

/**
 * Complete Dynamic Form Component
 */
export const DynamicForm = ({
  viewConfig,
  uiResources,
  formData,
  onChange,
  onSubmit,
  errors = [],
  actionButtons = { main: [], secondary: [] },
  loading = false,
}) => {
  const fields = extractFieldsFromView(viewConfig, uiResources);

  const handleFieldChange = (fieldName, value) => {
    onChange({ ...formData, [fieldName]: value });
  };

  const getFieldError = (fieldName) => {
    const error = errors.find(
      (e) => e.erroneousInputOutputIdentifier === `.${fieldName}`,
    );
    return error?.localizedValue || error?.message;
  };

  const renderField = (field) => {
    if (field.type === "Group") {
      return (
        <div className="form-group-container" key={field.heading}>
          <h3 className="group-heading">{field.heading}</h3>
          <div className="dynamic-form-grid">
            {field.children.map((childField) => (
              <DynamicField
                key={childField.name}
                field={childField}
                value={formData[childField.name]}
                onChange={handleFieldChange}
                error={getFieldError(childField.name)}
                formData={formData}
              />
            ))}
          </div>
        </div>
      );
    }

    return (
      <DynamicField
        key={field.name}
        field={field}
        value={formData[field.name]}
        onChange={handleFieldChange}
        error={getFieldError(field.name)}
        formData={formData}
      />
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="dynamic-form-grid">{fields.map(renderField)}</div>

      <div className="btn-group">
        {actionButtons.secondary?.map((btn, i) => (
          <button
            key={i}
            type="button"
            className="btn btn-secondary"
            onClick={() => console.log(`${btn.name} clicked`)}
          >
            {btn.name}
          </button>
        ))}
        {actionButtons.main?.map((btn, i) => (
          <button
            key={i}
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? (
              <div
                className="loading-spinner"
                style={{ width: "16px", height: "16px" }}
              />
            ) : (
              btn.name
            )}
          </button>
        ))}
      </div>
    </form>
  );
};

export default DynamicForm;
