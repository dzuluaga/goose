use rmcp::model::{CallToolResult, ContentBlock, ResourceContents, Role};
use serde_json::{json, Value};

use crate::config::Config;

pub(crate) const A2UI_MIME_TYPE: &str = "application/a2ui+json";

pub(crate) const A2UI_META_KEY: &str = "a2ui";

/// Must match `basicCatalog.id` in `@a2ui/react`, which renders these surfaces in goose desktop.
const BASIC_CATALOG_ID: &str = "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json";

pub(crate) fn enabled() -> bool {
    Config::global()
        .get_param::<bool>("GOOSE_EXPERIMENTAL_A2UI")
        .unwrap_or(false)
}

/// Tells an A2UI server which protocol versions and catalogs goose renders. Sent in each tool
/// call's `_meta` because rmcp's `ClientCapabilities` can't carry the binding's top-level `a2ui` key.
pub(crate) fn client_capabilities() -> Value {
    json!({
        "clientCapabilities": {
            "v0.9": { "supportedCatalogIds": [BASIC_CATALOG_ID] }
        }
    })
}

/// Restricts A2UI resources to the user, whatever audience the server declared, so both agent
/// loops drop them before inference.
pub(crate) fn restrict_to_user(result: &mut CallToolResult) {
    for block in &mut result.content {
        let ContentBlock::Resource(embedded) = block else {
            continue;
        };
        if is_a2ui(&embedded.resource) {
            let annotations = embedded.annotations.take().unwrap_or_default();
            embedded.annotations = Some(annotations.with_audience(vec![Role::User]));
        }
    }
}

fn is_a2ui(resource: &ResourceContents) -> bool {
    matches!(
        resource,
        ResourceContents::TextResourceContents { mime_type: Some(mime_type), .. }
            if mime_type == A2UI_MIME_TYPE
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::conversation::message::{Message, MessageContent};
    use rmcp::model::{Annotations, EmbeddedResource};

    fn text_resource(mime_type: &str) -> ResourceContents {
        ResourceContents::TextResourceContents {
            uri: "a2ui://booking".to_string(),
            mime_type: Some(mime_type.to_string()),
            text: r#"[{"version":"v0.9"}]"#.to_string(),
            meta: None,
        }
    }

    fn audience(block: &ContentBlock) -> Option<Vec<Role>> {
        match block {
            ContentBlock::Resource(embedded) => embedded.annotations.as_ref()?.audience.clone(),
            ContentBlock::Text(text) => text.annotations.as_ref()?.audience.clone(),
            _ => None,
        }
    }

    #[test]
    fn restricts_only_a2ui_resources_to_the_user() {
        let mut result = CallToolResult::success(vec![
            ContentBlock::text("fallback"),
            ContentBlock::resource(text_resource(A2UI_MIME_TYPE)),
            ContentBlock::resource(text_resource("text/html;profile=mcp-app")),
        ]);

        restrict_to_user(&mut result);

        assert_eq!(audience(&result.content[0]), None);
        assert_eq!(audience(&result.content[1]), Some(vec![Role::User]));
        assert_eq!(audience(&result.content[2]), None);
    }

    #[test]
    fn overrides_server_audience_and_keeps_other_annotations() {
        let declared = Annotations::default()
            .with_audience(vec![Role::Assistant])
            .with_priority(0.5);
        let mut result = CallToolResult::success(vec![ContentBlock::Resource(
            EmbeddedResource::new(text_resource(A2UI_MIME_TYPE)).with_annotations(declared),
        )]);

        restrict_to_user(&mut result);

        let ContentBlock::Resource(embedded) = &result.content[0] else {
            panic!("expected a resource block");
        };
        let annotations = embedded.annotations.as_ref().unwrap();
        assert_eq!(annotations.audience, Some(vec![Role::User]));
        assert_eq!(annotations.priority, Some(0.5));
    }

    #[test]
    fn restricted_resource_never_reaches_the_model() {
        let mut result = CallToolResult::success(vec![
            ContentBlock::text("Booked JL 1"),
            ContentBlock::resource(text_resource(A2UI_MIME_TYPE)),
        ]);
        restrict_to_user(&mut result);

        let message = Message::user().with_tool_response("call-1", Ok(result));

        assert_eq!(tool_response_blocks(&message.agent_visible_content()), 1);
        assert_eq!(tool_response_blocks(&message.user_visible_content()), 2);
    }

    fn tool_response_blocks(message: &Message) -> usize {
        message
            .content
            .iter()
            .find_map(|content| match content {
                MessageContent::ToolResponse(response) => response.tool_result.as_ref().ok(),
                _ => None,
            })
            .map_or(0, |result| result.content.len())
    }

    #[test_case::test_case("true", true; "on")]
    #[test_case::test_case("false", false; "off")]
    fn flag_controls_a2ui(value: &str, expected: bool) {
        let _guard = env_lock::lock_env([("GOOSE_EXPERIMENTAL_A2UI", Some(value))]);

        assert_eq!(enabled(), expected);
    }

    #[test]
    fn advertises_the_renderers_basic_catalog() {
        assert_eq!(
            client_capabilities()["clientCapabilities"]["v0.9"]["supportedCatalogIds"],
            json!([BASIC_CATALOG_ID])
        );
    }
}
