import { useState, useCallback } from "react";

/**
 * Utility to clean Pega label strings (removes @FL, @L, @P prefixes)
 */
export const cleanLabel = (text = "") => {
  return text
    .replace(/^@FL\s+\.?/, "")
    .replace(/^@L\s+/, "")
    .replace(/^@P\s+\./, "")
    .replace(/^.*\./, "")
    .trim();
};

/**
 * Extract field name from Pega value reference (@P .FieldName)
 */
export const extractFieldName = (valueRef = "") => {
  return valueRef
    .replace(/^@P\s+\./, "")
    .replace(/^@FILTERED_LIST\s+/, "")
    .replace(/\[\]/g, "")
    .trim();
};

/**
 * Get field metadata from uiResources.fields
 */
export const getFieldMetadata = (fieldName, uiResources) => {
  const simpleName = fieldName.includes(".")
    ? fieldName.split(".").pop()
    : fieldName;
  return uiResources?.fields?.[simpleName]?.[0] || {};
};

/**
 * Get field configuration from view config
 */
export const getFieldConfig = (fieldName, viewConfig) => {
  if (!viewConfig?.children) return {};

  const findInChildren = (children) => {
    for (const child of children) {
      if (child.children) {
        const found = findInChildren(child.children);
        if (found) return found;
      }
      const childFieldName = extractFieldName(child.config?.value);
      if (childFieldName === fieldName) {
        return child.config || {};
      }
    }
    return null;
  };

  return findInChildren(viewConfig.children) || {};
};

/**
 * Map Pega component type to HTML input type and field category
 */
export const mapFieldType = (componentType, fieldMetadata = {}) => {
  const type = componentType || fieldMetadata.type || "Text";
  const typeLower = type.toLowerCase();

  // Component type mapping
  const typeMap = {
    integer: { inputType: "number", category: "input", isNumeric: true },
    decimal: { inputType: "number", category: "input", isNumeric: true },
    email: { inputType: "email", category: "input" },
    date: { inputType: "date", category: "input" },
    textinput: { inputType: "text", category: "input" },
    dropdown: { inputType: "select", category: "select" },
    autocomplete: { inputType: "text", category: "autocomplete" },
    textarea: { inputType: "text", category: "textarea" },
    checkbox: { inputType: "checkbox", category: "checkbox" },
    pega_extensions_maskedinput: { inputType: "text", category: "masked" },
    currency: { inputType: "number", category: "input", isNumeric: true },
    percentage: { inputType: "number", category: "input", isNumeric: true },
    number: { inputType: "number", category: "input", isNumeric: true },
  };

  // Check metadata validateAs for email validation
  if (fieldMetadata.validateAs === "ValidEmailAddress") {
    return { inputType: "email", category: "input", isNumeric: false };
  }

  // Check metadata type if component type not found
  const metadataTypeLower = (fieldMetadata.type || "").toLowerCase();
  if (typeMap[metadataTypeLower]) {
    return typeMap[metadataTypeLower];
  }

  return typeMap[typeLower] || { inputType: "text", category: "input", isNumeric: false };
};

/**
 * Format input value based on mask pattern (e.g., "0000-0000-0000")
 */
export const applyMask = (value, maskPattern) => {
  if (!maskPattern || !value) return value;

  // Remove non-digit characters from value
  const digits = value.replace(/\D/g, "");

  let result = "";
  let digitIndex = 0;

  for (let i = 0; i < maskPattern.length && digitIndex < digits.length; i++) {
    if (maskPattern[i] === "0") {
      result += digits[digitIndex];
      digitIndex++;
    } else {
      result += maskPattern[i];
    }
  }

  return result;
};

/**
 * Parse mask pattern to get placeholder
 */
export const getMaskPlaceholder = (maskPattern) => {
  if (!maskPattern) return "";
  return maskPattern.replace(/0/g, "#");
};

/**
 * Extract all fields from view configuration with their metadata
 */
export const extractFieldsFromView = (viewConfig, uiResources) => {
  const fields = [];
  const processed = new Set();

  const walk = (children, parentGroup = null) => {
    children.forEach((child) => {
      // Handle nested views
      if (child.type === "reference" && child.config?.type === "view") {
        const nestedView = uiResources?.views?.[child.config.name]?.[0];
        if (nestedView) {
          walk(nestedView.children || []);
        }
        return;
      }

      // Handle Groups
      if (child.type === "Group") {
        const groupFields = [];
        (child.children || []).forEach((groupChild) => {
          if (groupChild.config?.value) {
            const fieldName = extractFieldName(groupChild.config.value);
            if (!processed.has(fieldName)) {
              processed.add(fieldName);
              const metadata = getFieldMetadata(fieldName, uiResources);
              const config = groupChild.config;
              const typeInfo = mapFieldType(groupChild.type, metadata);

              groupFields.push({
                name: fieldName,
                label: cleanLabel(config.label) || metadata.label || fieldName,
                type: groupChild.type,
                metadata,
                config,
                ...typeInfo,
                required: config.required || metadata.required || false,
                readOnly: config.readOnly || false,
                placeholder: config.placeholder,
                helperText: cleanLabel(config.helperText || ""),
                mask: config.mask ? cleanLabel(config.mask) : null,
                maxLength: metadata.maxLength,
                options: metadata.datasource?.records || [],
                group: cleanLabel(child.config?.heading || ""),
              });
            }
          }
        });

        if (groupFields.length > 0) {
          fields.push({
            type: "Group",
            heading: cleanLabel(child.config?.heading || ""),
            children: groupFields,
          });
        }
        return;
      }

      // Handle Regions
      if (child.type === "Region" || child.type === "View") {
        walk(child.children || [], parentGroup);
        return;
      }

      // Handle regular form fields
      if (child.config?.value && child.type !== "reference") {
        const fieldName = extractFieldName(child.config.value);

        if (fieldName === "pyID" || processed.has(fieldName)) return;

        // Skip parent fields if child is already processed
        const parentField = fieldName.includes(".") ? fieldName.split(".")[0] : null;
        if (parentField && processed.has(parentField)) return;

        processed.add(fieldName);
        if (parentField) processed.add(parentField);

        const metadata = getFieldMetadata(fieldName, uiResources);
        const config = child.config;
        const typeInfo = mapFieldType(child.type, metadata);

        fields.push({
          name: fieldName,
          label: cleanLabel(config.label) || metadata.label || fieldName,
          type: child.type,
          metadata,
          config,
          ...typeInfo,
          required: config.required || metadata.required || false,
          readOnly: config.readOnly || false,
          placeholder: config.placeholder,
          helperText: cleanLabel(config.helperText || ""),
          mask: config.mask ? cleanLabel(config.mask) : null,
          maxLength: metadata.maxLength,
          options: metadata.datasource?.records || [],
          validateAs: metadata.validateAs,
          group: parentGroup,
        });
      }
    });
  };

  if (viewConfig?.children) {
    walk(viewConfig.children);
  }

  return fields;
};

/**
 * Validate a single field value
 */
export const validateField = (value, field) => {
  const errors = [];

  // Required validation
  if (field.required && (value === undefined || value === "" || value === null)) {
    errors.push(`${field.label} is required`);
  }

  // Email validation
  if (field.validateAs === "ValidEmailAddress" || field.inputType === "email") {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (value && !emailRegex.test(value)) {
      errors.push("Please enter a valid email address");
    }
  }

  // Max length validation
  if (field.maxLength && value && value.length > field.maxLength) {
    errors.push(`${field.label} must not exceed ${field.maxLength} characters`);
  }

  // Numeric validation
  if (field.isNumeric && value !== "" && value !== undefined) {
    const numValue = Number(value);
    if (isNaN(numValue)) {
      errors.push(`${field.label} must be a valid number`);
    }
  }

  return errors;
};

/**
 * Single Field Component
 */
export const DynamicField = ({
  field,
  value,
  onChange,
  onBlur,
  error,
  formData,
}) => {
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
    [field, onChange]
  );

  const handleBlur = useCallback(() => {
    setTouched(true);
    if (onBlur) onBlur(field.name);
  }, [field.name, onBlur]);

  const handleCheckboxChange = useCallback(
    (e) => {
      onChange(field.name, e.target.checked);
    },
    [field, onChange]
  );

  const displayValue = value ?? "";
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
            <option value="">{field.placeholder || `Select ${field.label}...`}</option>
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
            placeholder={field.mask ? getMaskPlaceholder(field.mask) : field.placeholder}
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
      (e) => e.erroneousInputOutputIdentifier === `.${fieldName}`
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
      <div className="dynamic-form-grid">
        {fields.map(renderField)}
      </div>

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
