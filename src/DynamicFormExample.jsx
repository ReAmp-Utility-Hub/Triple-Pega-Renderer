/**
 * Example: Using DynamicFieldRenderer with Pega API Response
 *
 * This demonstrates how to use the DynamicForm component with the JSON
 * response structure you provided.
 */

import { useState, useCallback } from "react";
import { DynamicForm, DynamicField } from "./DynamicFieldRenderer";
import {
  extractFieldsFromView,
  getFieldMetadata,
  getFieldConfig,
  applyMask,
  validateField,
  cleanLabel,
} from "./DynamicFieldUtils";

// Example component using the dynamic form renderer
export function PegaFormExample() {
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);

  // This would come from your API response
  const exampleApiResponse = {
    data: {
      caseInfo: {
        caseTypeID: "OQ7AIU-Smart-Work-PurchaseVehicle",
        content: {
          CustomerName: "",
          CustomerID: "",
          BudgetAmount: "",
          CustomerCountry: "",
          CustomerDistrict: "",
          CustomerCity: "",
          PostalCode: "",
          DeliveryDateExpected: "",
          CustomerEmail: "",
        },
      },
    },
    uiResources: {
      resources: {
        views: {
          CollectCustomerDetails: [
            {
              children: [
                {
                  children: [
                    {
                      config: {
                        label: "@FL .CustomerName",
                        required: true,
                        value: "@P .CustomerName",
                      },
                      type: "TextInput",
                    },
                    {
                      config: {
                        helperText: "@L Please enter the PAN Card Details",
                        label: "@L Customer ID (PAN ID)",
                        mask: "@L 0000-0000-0000",
                        required: true,
                        value: "@P .CustomerID",
                      },
                      fieldtype: "Text",
                      type: "Pega_Extensions_MaskedInput",
                    },
                    {
                      config: {
                        label: "@FL .BudgetAmount",
                        value: "@P .BudgetAmount",
                      },
                      type: "Decimal",
                    },
                    {
                      config: {
                        datasource: "@ASSOCIATED .CustomerCountry",
                        deferDatasource: true,
                        label: "@FL .CustomerCountry",
                        placeholder: "@L Select...",
                        value: "@P .CustomerCountry",
                      },
                      type: "Dropdown",
                    },
                    {
                      config: {
                        label: "@FL .CustomerDistrict",
                        value: "@P .CustomerDistrict",
                      },
                      type: "TextInput",
                    },
                    {
                      config: {
                        label: "@FL .CustomerCity",
                        value: "@P .CustomerCity",
                      },
                      type: "TextInput",
                    },
                    {
                      config: {
                        label: "@FL .PostalCode",
                        value: "@P .PostalCode",
                      },
                      type: "Integer",
                    },
                    {
                      config: {
                        label: "@FL .DeliveryDateExpected",
                        value: "@P .DeliveryDateExpected",
                      },
                      type: "Date",
                    },
                    {
                      config: {
                        label: "@FL .CustomerEmail",
                        value: "@P .CustomerEmail",
                      },
                      type: "Email",
                    },
                  ],
                  name: "Fields",
                  type: "Region",
                },
              ],
              config: {
                NumCols: "2",
                template: "DefaultForm",
              },
              name: "CollectCustomerDetails",
              type: "View",
            },
          ],
        },
        fields: {
          CustomerDistrict: [
            {
              classID: "OQ7AIU-Smart-Work-PurchaseVehicle",
              type: "Text",
              maxLength: 256,
              displayAs: "pxTextInput",
              label: "Customer District",
            },
          ],
          CustomerEmail: [
            {
              classID: "OQ7AIU-Smart-Work-PurchaseVehicle",
              type: "Text",
              maxLength: 256,
              displayAs: "pxEmail",
              label: "Customer Email",
              validateAs: "ValidEmailAddress",
            },
          ],
          BudgetAmount: [
            {
              classID: "OQ7AIU-Smart-Work-PurchaseVehicle",
              type: "Decimal",
              displayAs: "pxNumber",
              label: "Budget Amount",
            },
          ],
          CustomerCountry: [
            {
              classID: "OQ7AIU-Smart-Work-PurchaseVehicle",
              type: "Text",
              displayAs: "pxDropdown",
              label: "Customer Country",
              datasource: {
                tableType: "PromptList",
                records: [
                  { key: "Albania", value: "Albania" },
                  { key: "Algeria", value: "Algeria" },
                  { key: "Japan", value: "Japan" },
                  { key: "Jordan", value: "Jordan" },
                  { key: "Jamaica", value: "Jamaica" },
                  { key: "India", value: "India" },
                  { key: "Indonesia", value: "Indonesia" },
                ],
              },
            },
          ],
          DeliveryDateExpected: [
            {
              classID: "OQ7AIU-Smart-Work-PurchaseVehicle",
              type: "Date",
              displayAs: "pxDateTime",
              label: "Delivery Date Expected",
            },
          ],
          CustomerName: [
            {
              classID: "OQ7AIU-Smart-Work-PurchaseVehicle",
              type: "Text",
              maxLength: 256,
              displayAs: "pxTextInput",
              label: "Customer Name",
            },
          ],
          CustomerID: [
            {
              classID: "OQ7AIU-Smart-Work-PurchaseVehicle",
              type: "Text",
              maxLength: 256,
              displayAs: "pxTextInput",
              label: "Customer ID",
            },
          ],
          CustomerCity: [
            {
              classID: "OQ7AIU-Smart-Work-PurchaseVehicle",
              type: "Text",
              maxLength: 256,
              displayAs: "pxTextInput",
              label: "Customer City",
            },
          ],
          PostalCode: [
            {
              classID: "OQ7AIU-Smart-Work-PurchaseVehicle",
              type: "Integer",
              displayAs: "pxInteger",
              label: "Postal Code",
            },
          ],
        },
      },
      actionButtons: {
        secondary: [
          { jsAction: "cancelAssignment", name: "Cancel", actionID: "cancel" },
          {
            jsAction: "fillFormWithAI",
            name: "Fill form with AI",
            actionID: "fillFormWithAI",
          },
        ],
        main: [
          { jsAction: "finishAssignment", name: "Submit", actionID: "submit" },
        ],
      },
    },
  };

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();

      // Client-side validation
      const viewConfig =
        exampleApiResponse.uiResources.resources.views
          .CollectCustomerDetails[0];
      const uiResources = exampleApiResponse.uiResources.resources;
      const fields = extractFieldsFromView(viewConfig, uiResources);

      const newErrors = [];
      fields.forEach((field) => {
        if (field.type === "Group") {
          field.children.forEach((childField) => {
            const fieldErrors = validateField(
              formData[childField.name],
              childField,
            );
            if (fieldErrors.length > 0) {
              newErrors.push({
                erroneousInputOutputIdentifier: `.${childField.name}`,
                localizedValue: fieldErrors[0],
              });
            }
          });
        } else {
          const fieldErrors = validateField(formData[field.name], field);
          if (fieldErrors.length > 0) {
            newErrors.push({
              erroneousInputOutputIdentifier: `.${field.name}`,
              localizedValue: fieldErrors[0],
            });
          }
        }
      });

      if (newErrors.length > 0) {
        setErrors(newErrors);
        return;
      }

      setLoading(true);
      try {
        // Submit to Pega API
        console.log("Submitting form data:", formData);
        // await submitToPega(formData);
      } finally {
        setLoading(false);
      }
    },
    [formData],
  );

  // Accessing specific field information examples:
  const uiResources = exampleApiResponse.uiResources.resources;
  const viewConfig =
    exampleApiResponse.uiResources.resources.views.CollectCustomerDetails[0];

  // 1. Get field metadata (type, validateAs, maxLength, etc.)
  const budgetMetadata = getFieldMetadata("BudgetAmount", uiResources);
  console.log("Budget field type:", budgetMetadata.type); // "Decimal"

  const emailMetadata = getFieldMetadata("CustomerEmail", uiResources);
  console.log("Email validation:", emailMetadata.validateAs); // "ValidEmailAddress"

  // 2. Get field config from view (mask, required, placeholder, etc.)
  const customerIdConfig = getFieldConfig("CustomerID", viewConfig);
  console.log("CustomerID mask:", customerIdConfig.mask); // "@L 0000-0000-0000"
  console.log("CustomerID required:", customerIdConfig.required); // true

  // 3. Apply mask to input value
  const maskedValue = applyMask("123456789012", "0000-0000-0000");
  console.log("Masked PAN:", maskedValue); // "1234-5678-9012"

  // 4. Extract all fields with complete metadata
  const allFields = extractFieldsFromView(viewConfig, uiResources);
  console.log("Extracted fields:", allFields);

  return (
    <div className="form-container">
      <h2>Dynamic Pega Form Example</h2>

      {/* Using the complete DynamicForm component */}
      <DynamicForm
        viewConfig={viewConfig}
        uiResources={uiResources}
        formData={formData}
        onChange={setFormData}
        onSubmit={handleSubmit}
        errors={errors}
        actionButtons={exampleApiResponse.uiResources.actionButtons}
        loading={loading}
      />

      {/* Debug: Show extracted field info */}
      <div
        style={{
          marginTop: "2rem",
          padding: "1rem",
          background: "#f1f5f9",
          borderRadius: "8px",
        }}
      >
        <h4>Field Metadata Debug</h4>
        <pre style={{ fontSize: "12px", overflow: "auto" }}>
          {JSON.stringify(
            allFields.map((f) => ({
              name: f.name,
              type: f.type,
              inputType: f.inputType,
              required: f.required,
              validateAs: f.validateAs,
              mask: f.mask,
            })),
            null,
            2,
          )}
        </pre>
      </div>
    </div>
  );
}

// Example: Rendering individual fields with manual control
export function ManualFieldExample() {
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState([]);

  // Field definition matching Pega response structure
  const customerIdField = {
    name: "CustomerID",
    label: "Customer ID (PAN ID)",
    type: "Pega_Extensions_MaskedInput",
    category: "masked",
    inputType: "text",
    required: true,
    mask: "0000-0000-0000",
    helperText: "Please enter the PAN Card Details",
    metadata: {
      type: "Text",
      maxLength: 256,
      validateAs: null,
    },
  };

  const emailField = {
    name: "CustomerEmail",
    label: "Customer Email",
    type: "Email",
    category: "input",
    inputType: "email",
    required: false,
    validateAs: "ValidEmailAddress",
    metadata: {
      type: "Text",
      maxLength: 256,
      validateAs: "ValidEmailAddress",
    },
  };

  const budgetField = {
    name: "BudgetAmount",
    label: "Budget Amount",
    type: "Decimal",
    category: "input",
    inputType: "number",
    isNumeric: true,
    required: false,
    metadata: {
      type: "Decimal",
    },
  };

  const countryField = {
    name: "CustomerCountry",
    label: "Customer Country",
    type: "Dropdown",
    category: "select",
    inputType: "select",
    required: false,
    options: [
      { key: "Albania", value: "Albania" },
      { key: "Algeria", value: "Algeria" },
      { key: "Japan", value: "Japan" },
      { key: "Jordan", value: "Jordan" },
      { key: "Jamaica", value: "Jamaica" },
      { key: "India", value: "India" },
      { key: "Indonesia", value: "Indonesia" },
    ],
  };

  const handleChange = (fieldName, value) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
  };

  return (
    <div className="form-container">
      <h2>Manual Field Examples</h2>
      <div className="dynamic-form-grid">
        <DynamicField
          field={customerIdField}
          value={formData.CustomerID}
          onChange={handleChange}
          error={
            errors.find(
              (e) => e.erroneousInputOutputIdentifier === ".CustomerID",
            )?.localizedValue
          }
        />
        <DynamicField
          field={emailField}
          value={formData.CustomerEmail}
          onChange={handleChange}
          error={
            errors.find(
              (e) => e.erroneousInputOutputIdentifier === ".CustomerEmail",
            )?.localizedValue
          }
        />
        <DynamicField
          field={budgetField}
          value={formData.BudgetAmount}
          onChange={handleChange}
          error={
            errors.find(
              (e) => e.erroneousInputOutputIdentifier === ".BudgetAmount",
            )?.localizedValue
          }
        />
        <DynamicField
          field={countryField}
          value={formData.CustomerCountry}
          onChange={handleChange}
          error={
            errors.find(
              (e) => e.erroneousInputOutputIdentifier === ".CustomerCountry",
            )?.localizedValue
          }
        />
      </div>
    </div>
  );
}

export default PegaFormExample;
