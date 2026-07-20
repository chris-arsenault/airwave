plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

fun String.asBuildConfigString(): String =
    "\"${replace("\\", "\\\\").replace("\"", "\\\"")}\""

android {
    namespace = "io.ahara.airwave"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.ahara.airwave"
        minSdk = 26
        targetSdk = 35
        versionCode = 4
        versionName = "0.2.0"

        val cognitoUserPoolId =
            providers.gradleProperty("AIRWAVE_COGNITO_USER_POOL_ID").orNull
                ?: System.getenv("AIRWAVE_COGNITO_USER_POOL_ID")
                ?: "us-east-1_XYYtBMb93"
        val cognitoClientId =
            providers.gradleProperty("AIRWAVE_COGNITO_CLIENT_ID").orNull
                ?: System.getenv("AIRWAVE_COGNITO_CLIENT_ID")
                ?: "3a50ac015feqftsb52rivacsd2"
        buildConfigField("String", "COGNITO_USER_POOL_ID", cognitoUserPoolId.asBuildConfigString())
        buildConfigField("String", "COGNITO_CLIENT_ID", cognitoClientId.asBuildConfigString())
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        create("release") {
            val storeFilePath = System.getenv("ANDROID_SIGNING_STORE_FILE")
            if (!storeFilePath.isNullOrBlank()) {
                storeFile = file(storeFilePath)
                storePassword = System.getenv("ANDROID_SIGNING_STORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_SIGNING_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_SIGNING_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (!System.getenv("ANDROID_SIGNING_STORE_FILE").isNullOrBlank()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}
