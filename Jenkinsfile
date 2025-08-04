pipeline {
    agent {
        docker {
            image 'namsangwon/backend-smart-contract:latest'

            args '-v $HOME/.npm:/root/.npm'
        }
    }

    environment {
        GIT_URL = "https://github.com/LG-CNS-2-FINAL-PROJECT-FINANCE/Backend_SmartContract.git"
        GITHUB_CREDENTIAL = "github-token"

        SEPOLIA_RPC_URL = credentials('SEPOLIA_RPC_URL')
        PRIVATE_KEY_ADMIN = credentials('PRIVATE_KEY_ADMIN')
        
        CHAINLINK_FUNCTIONS_SUBSCRIPTIONS = credentials('CHAINLINK_FUNCTIONS_SUBSCRIPTIONS')
        SEPOLIA_FUNCTIONS_ROUTER = credentials('SEPOLIA_FUNCTIONS_ROUTER')
        SEPOLIA_DON_ID = credentials('SEPOLIA_DON_ID')
        SEPOLIA_LINK_ADDR = credentials('SEPOLIA_LINK_ADDR')

        GELATO_TRUSTED_FORWARDER = credentials('GELATO_TRUSTED_FORWARDER')
        ETHERSCAN_API_KEY = credentials('ETHERSCAN_API_KEY')

        INVESTMENT_API_URL = credentials('INVESTMENT_API_URL')
        TRADE_API_URL = credentials('TRADE_API_URL')
        DEPLOY_RESULT_API_URL = credentials('DEPLOY_RESULT_API_URL')
    }

    parameters {
        string(name: 'TOKEN_NAME', description: 'The name of the token.')
        string(name: 'TOKEN_SYMBOL', description: 'The symbol of the token.')
        string(name: 'TOTAL_GOAL_AMOUNT', description: 'The total investment goal.')
        string(name: 'MIN_AMOUNT', description: 'The minimum investment amount.')
        string(name: 'TAG', defaultValue: 'main', description: 'The git branch or tag to build.')
    }

    stages {
        stage('Checkout') {
            steps {
                echo "Checking out Git branch/tag: ${params.TAG}"
                checkout([
                    $class: 'GitSCM',
                    branches: [[name: "${params.TAG}"]],
                    userRemoteConfigs: [[credentialsId: "${env.GITHUB_CREDENTIAL}", url: "${env.GIT_URL}"]]
                ])
            }
        }
        
        stage('Test') {
            steps {
                echo 'Running tests...'
                sh 'npm run test'
            }
        }
        
        stage('Deploy') {
            steps {
                script {
                    echo 'Deploying contract to Sepolia network...'

                    // withEnv 블록을 사용하여 환경 변수를 명시적으로 설정
                    withEnv([
                        "TOKEN_NAME=${params.TOKEN_NAME}",
                        "TOKEN_SYMBOL=${params.TOKEN_SYMBOL}",
                        "TOTAL_GOAL_AMOUNT=${params.TOTAL_GOAL_AMOUNT}",
                        "MIN_AMOUNT=${params.MIN_AMOUNT}",
                        "SEPOLIA_RPC_URL=${env.SEPOLIA_RPC_URL}",
                        "PRIVATE_KEY_ADMIN=${env.PRIVATE_KEY_ADMIN}",
                        "CHAINLINK_FUNCTIONS_SUBSCRIPTIONS=${env.CHAINLINK_FUNCTIONS_SUBSCRIPTIONS}",
                        "SEPOLIA_FUNCTIONS_ROUTER=${env.SEPOLIA_FUNCTIONS_ROUTER}",
                        "SEPOLIA_DON_ID=${env.SEPOLIA_DON_ID}",
                        "GELATO_TRUSTED_FORWARDER=${env.GELATO_TRUSTED_FORWARDER}",
                        "ETHERSCAN_API_KEY=${env.ETHERSCAN_API_KEY}",
                        "INVESTMENT_API_URL=${env.INVESTMENT_API_URL}",
                        "TRADE_API_URL=${env.TRADE_API_URL}",
                        "DEPLOY_RESULT_API_URL=${env.DEPLOY_RESULT_API_URL}"
                    ]) {
                        def deployOutput = sh(returnStdout: true, script: "npm run deploy")
                        
                        def contractAddress = (deployOutput =~ /FractionalInvestmentToken deployed to (0x[a-fA-F0-9]{40})/).collect { it[1] }[0]
                        
                        echo "Deployed contract address: ${contractAddress}"
                        
                        sh """
                            curl -X POST \\
                            -H "Content-Type: application/json" \\
                            -d '{
                                    "address":"${contractAddress}",
                                    "name":"${params.TOKEN_NAME}",
                                    "symbol":"${params.TOKEN_SYMBOL}"
                                }' \\
                            "${env.DEPLOY_RESULT_API_URL}"
                        """
                    }
                }
            }
        }
    }
    
    post {
        success {
            echo 'Deployment Pipeline Succeeded!'
            // Slack, Discord 등으로 성공 알림 전송
        }
        failure {
            echo 'Deployment Pipeline Failed!'
            // Slack, Discord 등으로 실패 알림 전송
        }
    }
}
